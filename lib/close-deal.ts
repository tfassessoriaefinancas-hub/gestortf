import type { ApplicationDatabase } from './database-types.ts';
import type { OperationAccess } from './operations.ts';
import { operationNotes } from './operation-finance.ts';
import { RecordUpdateError } from './update-operation.ts';

export const closureReasons = ['Operação reprovada', 'Financiamento reprovado', 'Cliente desistiu', 'Processo não prosseguiu', 'Não prosseguiu', 'Outro motivo'];

/** Archive a lost opportunity without deleting the client, operation or audit trail. */
export async function closeDeal(db: ApplicationDatabase, access: OperationAccess, id: number, reason: string, observations: string) {
  if (!closureReasons.includes(reason)) throw new RecordUpdateError('Selecione o motivo do encerramento.');
  if (observations.length > 1200) throw new RecordUpdateError('Use até 1.200 caracteres nas observações.');
  return db.transaction(async client => {
    const found = await client.query('SELECT * FROM deals WHERE id=$1 AND owner_id=ANY($2::text[]) FOR UPDATE', [id, access.ownerKeys]);
    const row = found.rows[0];
    if (!row || (access.role === 'employee' && Number(row.assigned_user_id) !== access.memberId)) throw new RecordUpdateError('Atendimento não encontrado.', 404);
    if (['processando_cadastro', 'concluido', 'excluido'].includes(row.status)) throw new RecordUpdateError('Este atendimento não pode ser encerrado nesta situação.', 409);
    if (row.stage === 'cancelado') return { id, alreadyClosed: true };
    const now = Date.now(), base = operationNotes(row.payload_json || row.title);
    const description = `Atendimento encerrado: ${reason}.${observations ? ` ${observations}` : ''}`;
    const payload = { ...base, closureReason: reason, closureNotes: observations, closedAt: now, returnStatus: 'concluido', history: [...(Array.isArray(base.history) ? base.history : []), { at: now, type: 'encerramento', reason, conversation: description }] };
    if (row.operation_id) {
      const operation = (await client.query('SELECT notes,completed_at,is_historical FROM operations WHERE id=$1 AND owner_id=ANY($2::text[]) AND deleted_at IS NULL FOR UPDATE', [row.operation_id, access.ownerKeys])).rows[0];
      if (operation?.completed_at || operation?.is_historical) throw new RecordUpdateError('Esta operação já foi concluída. Confira seu cadastro antes de encerrar.', 409);
      if (operation) await client.query("UPDATE operations SET status='cancelado',notes=$1,updated_at=$2 WHERE id=$3", [JSON.stringify({ ...operationNotes(operation.notes), closureReason: reason, closureNotes: observations, closedAt: now }), now, row.operation_id]);
    }
    await client.query("UPDATE deals SET stage='cancelado',status='cancelado',needs_completion=0,payload_json=$1,updated_at=$2 WHERE id=$3", [JSON.stringify(payload), now, id]);
    await client.query("INSERT INTO deal_history (owner_id,deal_id,operation_id,event_type,description,before_json,after_json,source,created_at) VALUES ($1,$2,$3,'encerramento',$4,$5,$6,'Gestão TF',$7)", [row.owner_id, id, row.operation_id || null, description, JSON.stringify({stage:row.stage,status:row.status}), JSON.stringify({reason,observations}), now]);
    return { id, closureReason: reason, closedAt: now };
  });
}
