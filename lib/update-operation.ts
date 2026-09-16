import type { PoolClient } from 'pg';
import type { PostgresDatabase } from './postgres.ts';
import { operationSelect, operationFromRow, type OperationAccess, type OperationRow } from './operations.ts';
import { operationNotes, feeLabels, isGrossCommission, isPartnerBonus, isPartnerLegacyBase, type CommissionRow } from './operation-finance.ts';
import { parseMoney, parseRate, toCents } from './money.ts';
import { hasGgCode, productionSources } from './production-source.ts';

export class RecordUpdateError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const has = (data: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(data, key);
const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const date = (value: unknown) => { const s = String(value || ''), m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return (m ? `${m[3]}-${m[2]}-${m[1]}` : s) || null; };
function addMonths(iso: string | null, months: number) {
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

async function updateClient(client: PoolClient, id: number, ownerKeys: string[], patch: Record<string, unknown>, now: number) {
  const result = await client.query('SELECT * FROM clients WHERE id=$1 AND owner_id=ANY($2::text[]) AND deleted_at IS NULL FOR UPDATE', [id, ownerKeys]);
  const row = result.rows[0];
  if (!row) throw new RecordUpdateError('Cliente não encontrado.', 404);
  const name = has(patch, 'name') ? String(patch.name || '').trim() : row.name;
  if (!name) throw new RecordUpdateError('Informe o nome do cliente.');
  let cpf = row.cpf, benefit = row.benefit_number;
  if (has(patch, 'document')) { const d = digits(patch.document); cpf = d.length === 11 ? d : null; benefit = d.length === 11 ? row.benefit_number : d || null; }
  if (has(patch, 'cpf')) cpf = digits(patch.cpf) || null;
  if (has(patch, 'benefit')) benefit = digits(patch.benefit) || null;
  if (cpf && cpf !== row.cpf) {
    const duplicate = await client.query('SELECT id FROM clients WHERE id!=$1 AND cpf=$2 AND owner_id=ANY($3::text[]) AND deleted_at IS NULL LIMIT 1', [id, cpf, ownerKeys]);
    if (duplicate.rowCount) throw new RecordUpdateError('Este CPF já pertence a outro cadastro. Revise o documento para evitar duplicidade.');
  }
  await client.query('UPDATE clients SET name=$1,normalized_name=$2,cpf=$3,benefit_number=$4,birth_date=$5,phone=$6,updated_at=$7 WHERE id=$8', [name, norm(name), cpf, benefit, has(patch, 'birthDate') ? date(patch.birthDate) : row.birth_date, has(patch, 'phone') ? String(patch.phone || '').trim() || null : row.phone, now, id]);
}

export async function updateClientRecord(db: PostgresDatabase, access: OperationAccess, id: number, patch: Record<string, unknown>) {
  return db.transaction(client => updateClient(client, id, access.ownerKeys, patch, Date.now()));
}

/** Update the original operation and its existing revenue rows atomically. */
export async function updateOperationRecord(db: PostgresDatabase, access: OperationAccess, id: number, patch: Record<string, unknown>) {
  return db.transaction(async client => {
    const found = await client.query<OperationRow>(`${operationSelect} WHERE o.id=$1 AND o.owner_id=ANY($2::text[]) AND o.deleted_at IS NULL AND c.deleted_at IS NULL FOR UPDATE OF o,c`, [id, access.ownerKeys]);
    const row = found.rows[0];
    if (!row || (access.role === 'employee' && (access.partnerId ? Number(row.partner_id) !== access.partnerId : Number(row.assigned_user_id) !== access.memberId))) throw new RecordUpdateError('Operação não encontrada.', 404);
    const before = operationFromRow(row), now = Date.now(), extra = operationNotes(row.notes);
    const next = { ...row };
    const textFields: Record<string, string> = { bank: 'bank', product: 'original_product', operationType: 'category', producer: 'producer', origin: 'origin', promoter: 'promoter', contractNumber: 'contract_number', status: 'status', vehiclePlate: 'vehicle_plate', vehicleName: 'vehicle_name', vehicleModel: 'vehicle_model' };
    for (const [key, column] of Object.entries(textFields)) if (has(patch, key)) next[column] = String(patch[key] ?? '').trim() || null;
    for (const [key, column] of Object.entries({ value: 'value_cents', installment: 'installment_cents', vehicleValue: 'vehicle_value_cents', financedValue: 'financed_value_cents', desiredCredit: 'desired_credit_cents', downPayment: 'down_payment_cents' })) {
      if (has(patch, key)) {
        if (parseMoney(patch[key]) < 0) throw new RecordUpdateError('Os valores financeiros não podem ser negativos.');
        next[column] = toCents(patch[key]);
      }
    }
    for (const [key, column] of Object.entries({ term: 'term', vehicleYear: 'vehicle_year' })) if (has(patch, key)) next[column] = Number(patch[key]) || null;
    for (const [key, column] of Object.entries({ operationDate: 'operation_date', paidAt: 'paid_at', paidDate: 'paid_at', completedAt: 'completed_at' })) if (has(patch, key)) next[column] = date(patch[key]);
    for (const key of ['agreement', 'contractType', 'dueDay', 'productionIndicator', 'postSale', 'postSaleNotes', 'observations', 'groupQuota']) if (has(patch, key)) extra[key] = String(patch[key] ?? '');
    for (const key of ['adhesionFee', 'advisoryFee', 'bonus', 'quotaUnitValue', 'fipeValue']) if (has(patch, key)) extra[`${key}Cents`] = toCents(patch[key]);
    for (const key of ['quotaQuantity', 'commissionInstallments']) if (has(patch, key)) extra[key] = Math.max(key === 'commissionInstallments' ? 1 : 0, Number(patch[key]) || 0);
    if (has(patch, 'commissionRate')) extra.commissionRate = parseRate(patch.commissionRate);
    if (has(patch, 'commissionPaid')) extra.commissionPaid = patch.commissionPaid === true || patch.commissionPaid === 'Sim';
    if (has(patch, 'revenueDueDate')) extra.revenueDueDate = date(patch.revenueDueDate) || '';

    const sourceChanged = String(next.producer || '') !== String(row.producer || '');
    const originChanged = String(next.origin || '') !== String(row.origin || '');
    if (sourceChanged && productionSources.includes(String(next.producer))) next.origin = hasGgCode(String(next.producer)) ? 'GG Veículos' : 'TF';
    if (sourceChanged || originChanged) {
      const origin = String(next.origin || 'TF');
      if (['Balcão', 'TF', 'Sem parceiro'].includes(origin)) { next.partner_id = null; next.origin = origin === 'Sem parceiro' ? 'TF' : origin; }
      else {
        let partner = await client.query('SELECT id FROM partners WHERE owner_id=ANY($1::text[]) AND lower(name)=lower($2) AND deleted_at IS NULL LIMIT 1', [access.ownerKeys, origin]);
        if (!partner.rowCount) partner = await client.query('INSERT INTO partners (owner_id,name,active,created_at,updated_at) VALUES ($1,$2,1,$3,$3) RETURNING id', [row.owner_id, origin, now]);
        next.partner_id = partner.rows[0].id;
      }
    }
    next.notes = JSON.stringify(extra);
    const after = operationFromRow(next);
    const paidChanged = has(patch, 'commissionPaid') && Boolean(extra.commissionPaid) !== before.commissionPaid;
    const dueChanged = has(patch, 'revenueDueDate') && date(patch.revenueDueDate) !== (before.revenueDueDate || null);
    const storedRevenue = (row.commissions || []).filter(item => !isPartnerLegacyBase(item) && !isPartnerBonus(item)).reduce((sum, item) => sum + Number(item.value_cents), 0);
    const financialChanged = storedRevenue !== toCents(after.commission) || ['value', 'commissionRate', 'adhesionFee', 'advisoryFee', 'bonus', 'commissionInstallments'].some(key => has(patch, key) && parseMoney(patch[key]) !== Number(before[key as keyof typeof before] || 0));
    const due = date(patch.revenueDueDate || before.revenueDueDate || next.operation_date);
    if (financialChanged && after.commission > 0 && !extra.commissionPaid && !due) throw new RecordUpdateError('Informe o vencimento da receita.');

    if (['name', 'document', 'cpf', 'benefit', 'birthDate', 'phone'].some(key => has(patch, key))) await updateClient(client, row.client_id, access.ownerKeys, patch, now);
    const columns = ['partner_id', 'bank', 'original_product', 'category', 'producer', 'origin', 'promoter', 'contract_number', 'value_cents', 'installment_cents', 'term', 'operation_date', 'paid_at', 'completed_at', 'status', 'notes', 'vehicle_plate', 'vehicle_name', 'vehicle_model', 'vehicle_year', 'vehicle_value_cents', 'financed_value_cents', 'desired_credit_cents', 'down_payment_cents'];
    await client.query(`UPDATE operations SET ${columns.map((column, index) => `${column}=$${index + 1}`).join(',')},updated_at=$${columns.length + 1} WHERE id=$${columns.length + 2}`, [...columns.map(column => next[column] ?? null), now, id]);

    if (financialChanged || paidChanged || dueChanged) {
      const revenues = (row.commissions || []).filter(item => !isPartnerBonus(item) && !isPartnerLegacyBase(item));
      const grossRows = revenues.filter(isGrossCommission);
      const installments = /consórcio/i.test(after.product) ? Math.min(120, Math.max(1, after.commissionInstallments)) : 1;
      const groups: { rows: CommissionRow[]; amount: number; count: number; rate: number | null; label: string }[] = [
        { rows: grossRows, amount: toCents(after.grossCommission), count: installments, rate: after.hasCommissionRate ? Math.round(after.commissionRate * 100) : null, label: 'Comissão' },
        ...Object.entries(feeLabels).map(([key, label]) => ({ rows: revenues.filter(item => item.notes === label), amount: Number(extra[key] ?? toCents(before[key.replace('Cents', '') as keyof typeof before])), count: 1, rate: null, label })),
      ];
      for (const group of groups) {
        if (group.amount === 0 && !group.rows.length) continue;
        const base = Math.floor(group.amount / group.count), remainder = group.amount - base * group.count;
        for (let index = 0; index < group.count; index++) {
          const existing = group.rows[index], amount = base + (index === 0 ? remainder : 0);
          const status = paidChanged || !existing ? extra.commissionPaid ? 'recebida' : 'prevista' : existing.status;
          const expected = !existing || dueChanged ? addMonths(due, index) : existing.expected_at || due;
          const received = status === 'recebida' || status === 'paga' || status === 'historica' ? existing?.received_at || expected : null;
          const label = group.count > 1 ? `${group.label} · Parcela ${index + 1}/${group.count}` : group.label;
          if (existing) await client.query('UPDATE commissions SET value_cents=$1,rate_bps=$2,expected_at=$3,received_at=$4,status=$5,updated_at=$6 WHERE id=$7', [amount, group.rate, expected, received, status, now, existing.id]);
          else if (amount > 0) await client.query('INSERT INTO commissions (owner_id,operation_id,value_cents,rate_bps,expected_at,received_at,status,notes,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)', [row.owner_id, id, amount, group.rate, expected, received, status, label, now]);
        }
        for (const surplus of group.rows.slice(group.count)) await client.query('UPDATE commissions SET deleted_at=$1,updated_at=$1 WHERE id=$2', [now, surplus.id]);
      }
    }
    const updated = await client.query<OperationRow>(`${operationSelect} WHERE o.id=$1`, [id]);
    return operationFromRow(updated.rows[0]);
  });
}
