import type { PostgresDatabase } from './postgres.ts';
import { operationFinance, operationNotes, type CommissionRow } from './operation-finance.ts';

export type OperationAccess = { ownerKeys: string[]; role: string; memberId: number | null; partnerId: number | null };
export type OperationRow = Record<string, unknown> & {
  id: number; owner_id: string; client_id: number; partner_id: number | null;
  value_cents: number; installment_cents: number; notes: string | null;
  commissions: CommissionRow[] | null; stored_ila_rate_bps: number | null;
};

export const completedOperationFilter = ' AND o.report_excluded=0 AND (o.completed_at IS NOT NULL OR o.is_historical=1)';
export const operationSelect = `SELECT o.*,c.name AS client_name,c.cpf AS client_cpf,
  c.benefit_number AS client_benefit,c.birth_date AS client_birth_date,c.phone AS client_phone,
  revenue.commissions,a.ila_rate_bps AS stored_ila_rate_bps,a.invoice_rate_bps,a.tf_share_bps,
  p.name AS partner_name
  FROM operations o JOIN clients c ON c.id=o.client_id
  LEFT JOIN partners p ON p.id=o.partner_id AND p.deleted_at IS NULL
  LEFT JOIN partner_operation_adjustments a ON a.operation_id=o.id AND (a.partner_id=o.partner_id OR o.partner_id IS NULL)
  LEFT JOIN LATERAL (SELECT json_agg(cm ORDER BY cm.expected_at,cm.id) AS commissions
    FROM commissions cm WHERE cm.operation_id=o.id AND cm.deleted_at IS NULL AND cm.status!='cancelada') revenue ON true`;

export function operationFromRow(row: OperationRow) {
  const extra = operationNotes(row.notes);
  const text = (key: string) => String(row[key] ?? '');
  const note = (key: string) => String(extra[key] ?? '');
  const commissions = row.commissions || [];
  const finance = operationFinance(Number(row.value_cents || 0), extra, commissions, Number(row.stored_ila_rate_bps || 0) / 100);
  const ordinary = commissions.filter(item => !/^(base após ila parceiro gg|bonificação parceiro gg)/i.test(item.notes || ''));
  const pending = ordinary.filter(item => !['recebida', 'paga', 'historica'].includes(item.status));
  const due = (pending.length ? pending : ordinary).map(item => item.expected_at || '').filter(Boolean).sort()[0] || note('revenueDueDate');
  return {
    id: 20_000_000 + row.id, dbId: row.id, assignedUserId: Number(row.assigned_user_id) || null,
    clientId: 10_000_000 + row.client_id, clientDbId: row.client_id,
    clientName: text('client_name'), clientCpf: text('client_cpf'), clientBenefit: text('client_benefit'),
    clientBirthDate: text('client_birth_date'), clientPhone: text('client_phone'),
    partnerId: row.partner_id, partnerName: text('partner_name'), product: text('original_product') || 'Operação',
    operationType: text('category'), agreement: note('agreement'), guaranteeType: note('guaranteeType'), contractType: note('contractType') || text('original_product'),
    dueDay: note('dueDay'), bank: text('bank') || 'Não informado', promoter: text('promoter'),
    producer: text('producer') || 'TF', productionIndicator: note('productionIndicator'), origin: text('origin') || 'TF',
    value: Number(row.value_cents || 0) / 100, installment: Number(row.installment_cents || 0) / 100,
    term: Number(row.term || 0), date: text('operation_date') || '1900-01-01', paidDate: text('paid_at'),
    completedAt: text('completed_at'), status: text('status') || 'em_atendimento',
    commission: finance.totalCents / 100, grossCommission: finance.grossCents / 100,
    commissionRate: finance.commissionRate, hasCommissionRate: finance.hasCommissionRate,
    commissionReceived: finance.receivedCents / 100, commissionPending: finance.pendingCents / 100,
    commissionInstallments: Number(extra.commissionInstallments || ordinary.filter(item => item.rate_bps != null).length || 1),
    commissionPaid: finance.commissionPaid, revenueDueDate: due,
    adhesionFee: finance.adhesionFeeCents / 100, advisoryFee: finance.advisoryFeeCents / 100, bonus: finance.bonusCents / 100,
    quotaQuantity: Number(extra.quotaQuantity || 0), quotaUnitValue: Number(extra.quotaUnitValueCents || 0) / 100,
    fipeValue: Number(extra.fipeValueCents || 0) / 100, postSale: note('postSale'), postSaleNotes: note('postSaleNotes'),
    observations: note('observations'), contractNumber: text('contract_number'), groupQuota: note('groupQuota'),
    vehiclePlate: text('vehicle_plate'), vehicleName: text('vehicle_name'), vehicleModel: text('vehicle_model'),
    vehicleYear: Number(row.vehicle_year || 0), vehicleValue: Number(row.vehicle_value_cents || 0) / 100,
    financedValue: Number(row.financed_value_cents || 0) / 100, desiredCredit: Number(row.desired_credit_cents || 0) / 100,
    downPayment: Number(row.down_payment_cents || 0) / 100,
    ilaRate: Number(row.stored_ila_rate_bps || 0) === 2600 ? 26.6 : Number(row.stored_ila_rate_bps || 0) / 100,
    invoiceRate: row.invoice_rate_bps != null ? Number(row.invoice_rate_bps) / 100 : /omni/i.test(text('bank')) ? 0 : 2.01,
    tfShare: row.tf_share_bps != null ? Number(row.tf_share_bps) / 100 : 50,
  };
}

export type CanonicalOperation = ReturnType<typeof operationFromRow>;

export async function readOperations(db: PostgresDatabase, access: OperationAccess, options: { limit?: number; offset?: number; ids?: number[]; includeIncomplete?: boolean } = {}) {
  if (options.ids && !options.ids.length) return [];
  const values: unknown[] = [access.ownerKeys[0], access.ownerKeys[1]];
  let scope = 'o.owner_id IN (?,?) AND o.deleted_at IS NULL AND c.deleted_at IS NULL';
  if (!options.includeIncomplete) scope += completedOperationFilter;
  if (access.role === 'employee') {
    scope += ` AND o.${access.partnerId ? 'partner_id' : 'assigned_user_id'}=?`;
    values.push(access.partnerId || access.memberId);
  }
  if (options.ids) { scope += ` AND o.id IN (${options.ids.map(() => '?').join(',')})`; values.push(...options.ids); }
  const paging = options.limit ? ` LIMIT ${Math.max(1, Math.floor(options.limit))} OFFSET ${Math.max(0, Math.floor(options.offset || 0))}` : '';
  const rows = await db.prepare(`${operationSelect} WHERE ${scope} ORDER BY o.updated_at DESC,o.id DESC${paging}`).bind(...values).all<OperationRow>();
  return rows.results.map(operationFromRow);
}
