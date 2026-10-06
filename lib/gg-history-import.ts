import type { ApplicationDatabase, DatabaseClient } from './database-types.ts';
import { hashPassword } from './password.ts';
import { operationNotes } from './operation-finance.ts';

export type GgHistoryRecord = {
  fingerprint: string;
  name: string;
  cpf: string;
  bank: string;
  product: string;
  installmentCents: number;
  valueCents: number;
  term: number;
  paidAt: string;
  phone: string;
  operationDate: string;
  producer: 'TF' | 'GG';
  origin: 'TF Assessoria e Finanças' | 'GG Veículos';
  grossCents: number;
  netCents: number;
  repasseCents: number;
  ilaRateBps: number;
  tfShareBps: number;
};

export type GgHistorySheet = {
  records: GgHistoryRecord[];
  bonus: { valueCents: number; date: string; description: string } | null;
};

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const normalizedName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const dateBr = (value: string) => {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
};
const moneyCents = (value: string) => {
  const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
};
const cleanBank = (value: string) => value.trim().replace(/\s+(?:TF|GG)$/i, '').replace(/\s+/g, ' ').replace(/^C6 BANK$/i, 'C6 Bank').trim();
const cleanProduct = (value: string) => /refin/i.test(value) ? 'Refinanciamento' : /financ/i.test(value) ? 'Financiamento' : value.trim();

export function parseGgHistorySpreadsheet(text: string): GgHistorySheet {
  const records: GgHistoryRecord[] = [];
  let bonus: GgHistorySheet['bonus'] = null;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const columns = line.split('\t').map(value => value.trim());
    if (/^REPASSE SEGURO\s*-\s*CAMPANHA$/i.test(columns[0] || '')) {
      const valueCents = moneyCents(columns[1] || ''), date = dateBr(columns[2] || '');
      if (valueCents > 0 && date) bonus = { valueCents, date, description: 'Bonificação parceiro GG · Seguro campanha' };
      continue;
    }
    const operationDate = dateBr(columns[9] || ''), name = columns[0] || '';
    if (!operationDate || !name || /^REPASSES$/i.test(name)) continue;
    const producer = /^GG$/i.test(columns[10] || '') ? 'GG' : /^TF$/i.test(columns[10] || '') ? 'TF' : null;
    if (!producer) continue;
    const rawCpf = digits(columns[1]), cpf = rawCpf.length === 11 ? rawCpf : '';
    const valueCents = moneyCents(columns[5] || ''), grossCents = moneyCents(columns[11] || ''), netCents = moneyCents(columns[12] || ''), repasseCents = moneyCents(columns[13] || '');
    const ilaRateBps = grossCents > 0 ? Math.max(0, Math.min(10_000, Math.round((grossCents - netCents) * 10_000 / grossCents))) : 0;
    const tfShareBps = netCents > 0 ? Math.max(0, Math.min(10_000, Math.round(repasseCents * 10_000 / netCents))) : 0;
    const key = cpf || normalizedName(name).replace(/[^a-z0-9]+/g, '-');
    records.push({
      fingerprint: `gg-history-2026:${key}:${operationDate}:${valueCents}`,
      name: name.replace(/\s+/g, ' ').trim(), cpf, bank: cleanBank(columns[2] || ''), product: cleanProduct(columns[3] || ''),
      installmentCents: moneyCents(columns[4] || ''), valueCents, term: Number(columns[6] || 0) || 0,
      paidAt: dateBr(columns[7] || '') || operationDate, phone: columns[8] && columns[8] !== '-' ? columns[8] : '', operationDate,
      producer, origin: producer === 'GG' ? 'GG Veículos' : 'TF Assessoria e Finanças', grossCents, netCents, repasseCents, ilaRateBps, tfShareBps,
    });
  }
  return { records, bonus };
}

type ImportAccess = { ownerId: string; ownerKeys: [string, string] };
type ImportSummary = { clientsCreated: number; clientsUpdated: number; operationsCreated: number; operationsUpdated: number; commissionsReconciled: number; adjustmentsReconciled: number; bonusReconciled: boolean; septemberReconciled: number; accessUserId: number; warnings: string[] };

export async function importGgHistory(db: ApplicationDatabase, access: ImportAccess, sheet: GgHistorySheet, password = '102030'): Promise<ImportSummary> {
  if (!sheet.records.length) throw new Error('Nenhuma operação válida foi encontrada na planilha.');
  return db.transaction(async client => {
    const queryOne = async <T extends Record<string, unknown>>(_client: DatabaseClient, sql: string, values: unknown[] = []) =>
      (await db.prepare(sql).bind(...values).execute<T>(client)).results[0] || null;
    const queryAll = async <T extends Record<string, unknown>>(_client: DatabaseClient, sql: string, values: unknown[] = []) =>
      (await db.prepare(sql).bind(...values).execute<T>(client)).results;
    const run = async (_client: DatabaseClient, sql: string, values: unknown[] = []) => {
      await db.prepare(sql).bind(...values).execute(client);
    };
    const now = Date.now(), summary: ImportSummary = { clientsCreated: 0, clientsUpdated: 0, operationsCreated: 0, operationsUpdated: 0, commissionsReconciled: 0, adjustmentsReconciled: 0, bonusReconciled: false, septemberReconciled: 0, accessUserId: 0, warnings: [] };
    let partner = await queryOne<{ id: number }>(client, 'SELECT id FROM partners WHERE owner_id IN (?,?) AND lower(name)=lower(?) AND deleted_at IS NULL ORDER BY id LIMIT 1', [...access.ownerKeys, 'GG Veículos']);
    if (!partner) partner = await queryOne<{ id: number }>(client, "INSERT INTO partners (owner_id,name,active,tax_rate_bps,invoice_rate_bps,tf_share_bps,created_at,updated_at) VALUES (?,'GG Veículos',1,0,0,5000,?,?) RETURNING id", [access.ownerId, now, now]);
    if (!partner) throw new Error('Não foi possível preparar o parceiro GG Veículos.');

    for (const item of sheet.records) {
      let clientRow = item.cpf
        ? await queryOne<{ id: number; owner_id: string }>(client, 'SELECT id,owner_id FROM clients WHERE owner_id IN (?,?) AND cpf=? ORDER BY CASE WHEN owner_id=? THEN 0 ELSE 1 END,id LIMIT 1', [...access.ownerKeys, item.cpf, access.ownerId])
        : await queryOne<{ id: number; owner_id: string }>(client, 'SELECT id,owner_id FROM clients WHERE owner_id IN (?,?) AND normalized_name=? ORDER BY CASE WHEN owner_id=? THEN 0 ELSE 1 END,id LIMIT 1', [...access.ownerKeys, normalizedName(item.name), access.ownerId]);
      if (!clientRow) {
        clientRow = await queryOne<{ id: number; owner_id: string }>(client, "INSERT INTO clients (owner_id,name,normalized_name,cpf,phone,source_row,created_at,updated_at) VALUES (?,?,?,?,?,'Planilha GG junho-agosto 2026',?,?) RETURNING id,owner_id", [access.ownerId, item.name, normalizedName(item.name), item.cpf || null, item.phone || null, now, now]);
        summary.clientsCreated++;
      } else {
        await run(client, "UPDATE clients SET name=?,normalized_name=?,phone=COALESCE(NULLIF(?,''),phone),source_row=COALESCE(source_row,'Planilha GG junho-agosto 2026'),deleted_at=NULL,updated_at=? WHERE id=?", [item.name, normalizedName(item.name), item.phone, now, clientRow.id]);
        summary.clientsUpdated++;
      }
      if (!clientRow) continue;
      let operation = await queryOne<{ id: number; owner_id: string; notes: string | null; source_row: string | null }>(client, 'SELECT id,owner_id,notes,source_row FROM operations WHERE owner_id IN (?,?) AND (dedupe_fingerprint=? OR (client_id=? AND operation_date=? AND value_cents=?)) ORDER BY CASE WHEN dedupe_fingerprint=? THEN 0 ELSE 1 END,id LIMIT 1', [...access.ownerKeys, item.fingerprint, clientRow.id, item.operationDate, item.valueCents, item.fingerprint]);
      const importedNotes = { ...(operationNotes(operation?.notes)), importedGrossCents: item.grossCents, importedNetCents: item.netCents, importedRepasseCents: item.repasseCents, importedFrom: 'Planilha GG junho-agosto 2026' };
      if (!operation) {
        operation = await queryOne(client, "INSERT INTO operations (owner_id,client_id,partner_id,bank,original_product,category,producer,origin,value_cents,installment_cents,term,operation_date,paid_at,completed_at,status,notes,source_row,dedupe_fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Finalizado',?,'Planilha GG junho-agosto 2026',?,?,?) RETURNING id,owner_id,notes,source_row", [clientRow.owner_id, clientRow.id, partner.id, item.bank || null, item.product || 'Operação', item.product || 'Operação', item.producer, item.origin, item.valueCents, item.installmentCents, item.term || null, item.operationDate, item.paidAt, item.paidAt, JSON.stringify(importedNotes), item.fingerprint, now, now]);
        summary.operationsCreated++;
      } else {
        await run(client, "UPDATE operations SET partner_id=?,bank=?,original_product=?,category=?,producer=?,origin=?,value_cents=?,installment_cents=CASE WHEN ?>0 THEN ? ELSE installment_cents END,term=CASE WHEN ?>0 THEN ? ELSE term END,operation_date=?,paid_at=?,completed_at=?,status='Finalizado',notes=?,source_row=COALESCE(source_row,'Planilha GG junho-agosto 2026'),dedupe_fingerprint=?,deleted_at=NULL,updated_at=? WHERE id=?", [partner.id, item.bank || null, item.product || 'Operação', item.product || 'Operação', item.producer, item.origin, item.valueCents, item.installmentCents, item.installmentCents, item.term, item.term, item.operationDate, item.paidAt, item.paidAt, JSON.stringify(importedNotes), item.fingerprint, now, operation.id]);
        summary.operationsUpdated++;
      }
      if (!operation) continue;
      const commissionRows = await queryAll<{ id: number; notes: string | null; rate_bps: number | null; value_cents: number; deleted_at: number | null }>(client, 'SELECT id,notes,rate_bps,value_cents,deleted_at FROM commissions WHERE operation_id=? ORDER BY id', [operation.id]);
      const importedCommission = commissionRows.find(row => /^Comissão bruta importada · Base GG junho-agosto 2026$/i.test(row.notes || ''));
      const legacyRows = commissionRows.filter(row => !row.deleted_at && /^Base após ILA parceiro GG/i.test(row.notes || ''));
      const ordinaryRows = commissionRows.filter(row => !row.deleted_at && !/^Base após ILA parceiro GG|^Bonificação parceiro GG|^Taxa de adesão$|^Taxa de assessoria$|^Bonificação$/i.test(row.notes || ''));
      if (item.grossCents > 0) {
        if (importedCommission) {
          await run(client, "UPDATE commissions SET owner_id=?,rate_bps=NULL,value_cents=?,expected_at=?,received_at=?,status='recebida',notes='Comissão bruta importada · Base GG junho-agosto 2026',deleted_at=NULL,updated_at=? WHERE id=?", [operation.owner_id, item.grossCents, item.paidAt, item.paidAt, now, importedCommission.id]);
          summary.commissionsReconciled++;
        } else if (!ordinaryRows.length || legacyRows.length) {
          await run(client, "INSERT INTO commissions (owner_id,operation_id,rate_bps,value_cents,expected_at,received_at,status,notes,created_at,updated_at) VALUES (?,?,NULL,?,?,?,'recebida','Comissão bruta importada · Base GG junho-agosto 2026',?,?)", [operation.owner_id, operation.id, item.grossCents, item.paidAt, item.paidAt, now, now]);
          summary.commissionsReconciled++;
        } else if (ordinaryRows.reduce((sum, row) => sum + Number(row.value_cents), 0) !== item.grossCents) {
          summary.warnings.push(`${item.name}: comissão existente preservada para revisão.`);
        }
      }
      for (const legacy of legacyRows) await run(client, 'UPDATE commissions SET deleted_at=?,updated_at=? WHERE id=?', [now, now, legacy.id]);
      await run(client, 'INSERT INTO partner_operation_adjustments (owner_id,partner_id,operation_id,ila_rate_bps,invoice_rate_bps,tf_share_bps,created_at,updated_at) VALUES (?,?,?,?,0,?,?,?) ON CONFLICT(operation_id) DO UPDATE SET owner_id=excluded.owner_id,partner_id=excluded.partner_id,ila_rate_bps=excluded.ila_rate_bps,invoice_rate_bps=0,tf_share_bps=excluded.tf_share_bps,updated_at=excluded.updated_at', [access.ownerId, partner.id, operation.id, item.ilaRateBps, item.tfShareBps, now, now]);
      summary.adjustmentsReconciled++;
    }

    if (sheet.bonus) {
      const anchor = await queryOne<{ id: number; owner_id: string }>(client, "SELECT id,owner_id FROM operations WHERE partner_id=? AND deleted_at IS NULL AND substr(operation_date,1,7)=substr(?,1,7) ORDER BY operation_date,id LIMIT 1", [partner.id, sheet.bonus.date]);
      if (anchor) {
        const existing = await queryOne<{ id: number }>(client, "SELECT id FROM commissions WHERE operation_id=? AND lower(COALESCE(notes,'')) LIKE 'bonificação parceiro gg%' ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,id LIMIT 1", [anchor.id]);
        if (existing) await run(client, "UPDATE commissions SET owner_id=?,rate_bps=NULL,value_cents=?,expected_at=?,received_at=?,status='recebida',notes=?,deleted_at=NULL,updated_at=? WHERE id=?", [anchor.owner_id, sheet.bonus.valueCents, sheet.bonus.date, sheet.bonus.date, sheet.bonus.description, now, existing.id]);
        else await run(client, "INSERT INTO commissions (owner_id,operation_id,rate_bps,value_cents,expected_at,received_at,status,notes,created_at,updated_at) VALUES (?,?,NULL,?,?,?,'recebida',?,?,?)", [anchor.owner_id, anchor.id, sheet.bonus.valueCents, sheet.bonus.date, sheet.bonus.date, sheet.bonus.description, now, now]);
        summary.bonusReconciled = true;
      }
    }

    const septemberTf = await queryAll<{ id: number; normalized_name: string }>(client, "SELECT o.id,c.normalized_name FROM operations o JOIN clients c ON c.id=o.client_id WHERE o.owner_id IN (?,?) AND o.deleted_at IS NULL AND substr(o.operation_date,1,7)='2026-09' AND (c.normalized_name LIKE '%mariana%dias%' OR c.normalized_name LIKE '%mikael%costa%reis%')", [...access.ownerKeys]);
    for (const operation of septemberTf) {
      const isMikael = operation.normalized_name.includes('mikael');
      await run(client, `UPDATE operations SET partner_id=?,producer='TF',origin='TF Assessoria e Finanças'${isMikael ? ",original_product='Crédito com garantia',category='Crédito com garantia'" : ''},updated_at=? WHERE id=?`, [partner.id, now, operation.id]);
      summary.septemberReconciled++;
    }

    const email = 'gg-veiculos@gestaotf.local', login = 'GG VEÍCULOS', permissions = JSON.stringify(['inicio', 'parceiros', 'relatorios']);
    let member = await queryOne<{ id: number }>(client, 'SELECT id FROM access_users WHERE owner_id IN (?,?) AND (partner_id=? OR lower(login)=lower(?) OR lower(email)=lower(?)) ORDER BY CASE WHEN partner_id=? THEN 0 ELSE 1 END,id LIMIT 1', [...access.ownerKeys, partner.id, login, email, partner.id]);
    if (member) await run(client, 'UPDATE access_users SET owner_id=?,name=?,email=?,login=?,permissions_json=?,partner_id=?,active=1,updated_at=? WHERE id=?', [access.ownerId, login, email, login, permissions, partner.id, now, member.id]);
    else member = await queryOne<{ id: number }>(client, 'INSERT INTO access_users (owner_id,name,email,login,permissions_json,partner_id,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?) RETURNING id', [access.ownerId, login, email, login, permissions, partner.id, now, now]);
    if (!member) throw new Error('Não foi possível preparar o acesso da GG Veículos.');
    summary.accessUserId = member.id;
    const userId = `member:${member.id}`;
    await run(client, "INSERT INTO users (id,email,login,name,role,active,created_at,updated_at) VALUES (?,?,?,?,'employee',1,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,login=excluded.login,name=excluded.name,active=1,updated_at=excluded.updated_at", [userId, email, login, login, now, now]);
    await run(client, 'INSERT INTO auth_credentials (user_id,password_hash,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at', [userId, await hashPassword(password), now]);
    await run(client, 'DELETE FROM auth_sessions WHERE user_id=?', [userId]);
    return summary;
  });
}
