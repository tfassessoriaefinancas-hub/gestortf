import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

process.loadEnvFile('.env.local');
const directory = resolve(process.env.LOCAL_DATA_DIR || './data');
if (existsSync(resolve(directory, 'neon-migration-plan.json'))) throw new Error('O plano inicial já existe. Reutilize-o; ele não será sobrescrito.');
const database = new DatabaseSync(resolve(directory, 'crm.sqlite'), { readOnly: true });
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
const sources: Row[] = [];
const names = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_local_migrations' ORDER BY name").all();
database.exec('BEGIN');
try {
  for (const { name } of names) {
    const key = String(name);
    tables[key] = database.prepare(`SELECT * FROM ${quote(key)}`).all() as Row[];
    tables[key].forEach((row, index) => sources.push({ source: `sqlite:${key}`, source_id: String(row.id || row.message_id || index), entity_type: key, entity_id: typeof row.id === 'number' ? row.id : null, payload: { ...row } }));
  }
} finally { database.exec('ROLLBACK'); database.close(); }
const read = (file: string) => JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
const historicalClients: Row[] = read('historical/tf-clients.json');
const historicalOperations: Row[] = read('historical/tf-operations.json');
const owner = process.env.LOCAL_USER_ID;
const email = process.env.LOCAL_USER_EMAIL;
if (!owner || !email) throw new Error('Configure LOCAL_USER_ID e LOCAL_USER_EMAIL antes da migração.');
const now = Date.now();
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const cents = (value: unknown) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || !Number.isSafeInteger(Math.round(number * 100))) throw new Error('Invalid source amount');
  return Math.round(number * 100);
};
const nextId = (rows: Row[]) => Math.max(0, ...rows.map((row) => Number(row.id))) + 1;
let clientId = nextId(tables.clients), operationId = nextId(tables.operations), commissionId = nextId(tables.commissions);
const originalCount = { clients: tables.clients.length, operations: tables.operations.length, commissions: tables.commissions.length };
const byCpf = new Map<string, Row>();
for (const row of [...tables.clients].sort((a, b) => Number(Boolean(b.deleted_at)) - Number(Boolean(a.deleted_at)))) if (digits(row.cpf)) byCpf.set(digits(row.cpf), row);
const clientMap = new Map<number, number>();
for (const source of historicalClients) {
  const cpf = digits(source.cpf);
  let row = cpf ? byCpf.get(cpf) : undefined;
  if (!row) {
    row = { id: clientId++, owner_id: owner, name: source.name, normalized_name: String(source.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(), cpf: cpf || null, benefit_number: source.benefit_number || null, birth_date: source.birth_date || null, phone: source.phone || null, source_row: 'Histórico original', created_at: now, updated_at: now };
    tables.clients.push(row);
    if (cpf) byCpf.set(cpf, row);
  }
  clientMap.set(source.id, row.id);
  sources.push({ source: 'historical:clients', source_id: String(source.id), entity_type: 'clients', entity_id: row.id, payload: source });
}
let excluded = 0;
for (const source of historicalOperations) {
  const mappedClient = clientMap.get(source.client_id);
  if (!mappedClient) throw new Error('Historical operation without client');
  const superseded = ['2026-08', '2026-09'].includes(String(source.operation_date || '').slice(0, 7));
  if (superseded) excluded++;
  const row = { id: operationId++, owner_id: owner, client_id: mappedClient, bank: source.bank || null, promoter: source.promoter || null, original_product: source.original_product || source.category || 'Operação', category: source.category || null, producer: source.producer || null, origin: source.origin || 'Histórico', benefit_number: source.benefit_number || null, value_cents: cents(source.value), installment_cents: cents(source.installment), term: source.term || null, operation_date: source.operation_date || null, status: source.status || 'Registro histórico', notes: JSON.stringify({ historical: true, possibleDuplicate: Boolean(source.possible_duplicate), originalFingerprint: source.fingerprint, commissionStatus: source.commission_status || null, ...(superseded ? { reportExclusionReason: 'Substituído pela base atualizada de agosto/setembro de 2026; mesma regra do painel original.' } : {}) }), source_row: `${source.source_sheet || 'Histórico'}:${source.source_row || source.id}`, dedupe_fingerprint: `historical:${source.id}`, created_at: now, updated_at: now, is_historical: 1, report_excluded: Number(superseded) };
  tables.operations.push(row);
  sources.push({ source: 'historical:operations', source_id: String(source.id), entity_type: 'operations', entity_id: row.id, payload: source });
  const commission = cents(source.commission);
  if (commission) {
    const status = /^(paga|finalizado)$/i.test(source.commission_status || '') ? 'recebida' : /aguardando/i.test(source.commission_status || '') ? 'prevista' : /recusada/i.test(source.commission_status || '') ? 'cancelada' : 'historica';
    tables.commissions.push({ id: commissionId++, owner_id: owner, operation_id: row.id, rate_bps: 0, value_cents: commission, expected_at: null, received_at: status === 'recebida' ? source.operation_date || null : null, status, notes: 'Comissão histórica', created_at: now, updated_at: now });
  }
}
for (const row of tables.operations) { row.is_historical ??= 0; row.report_excluded ??= 0; }
const importRows: Row[] = read('imports/aug-sep-2026.json');
importRows.forEach((row, index) => sources.push({ source: 'legacy-import:aug-sep-2026', source_id: String(index), payload: row }));
sources.push({ source: 'original-site-snapshot', source_id: '175', payload: read('source-snapshot.json') });
const admin = { id: owner, email, name: process.env.LOCAL_USER_NAME || 'Administrador', role: 'admin', active: 1, created_at: now, updated_at: now };
if (!tables.users.some((user) => user.id === owner)) tables.users.push(admin);
const summary = { originalTables: names.length, originalRecords: sources.filter((row) => row.source.startsWith('sqlite:')).length, historicalClients: historicalClients.length, historicalOperations: historicalOperations.length, mergedHistoricalClients: historicalClients.length - (tables.clients.length - originalCount.clients), preservedHistoricalOperationsExcludedFromReports: excluded, clients: tables.clients.length, operations: tables.operations.length, commissions: tables.commissions.length, archivedSourceRecords: sources.length };
const payload = { version: 1, tables, sources, admin, summary };
const contents = JSON.stringify(payload);
mkdirSync(resolve(directory, 'backups'), { recursive: true, mode: 0o700 });
writeFileSync(resolve(directory, 'neon-migration-plan.json'), contents, { mode: 0o600 });
writeFileSync(resolve(directory, 'backups/pre-neon-records.json'), JSON.stringify({ tables: Object.fromEntries(names.map(({name}) => [String(name), sources.filter((row) => row.source === `sqlite:${name}`).map((row) => row.payload)])) }), { mode: 0o600 });
console.log(JSON.stringify({ ...summary, sourceHash: createHash('sha256').update(contents).digest('hex') }, null, 2));
