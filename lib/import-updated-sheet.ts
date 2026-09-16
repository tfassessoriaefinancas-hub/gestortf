import { env } from '@/lib/runtime';
import { TF_OWNER_EMAIL } from '../app/chatgpt-auth';
import { hasGgCode } from './production-source';

type Row = {name:string;document:string;phone:string;birthDate:string|null;operationDate:string;paidAt:string;product:string;operationType:string;agreement:string;bank:string;value:number;installment:number;term:number|null;dueDay:string;productionIndicator:string;promoter:string;producer:string;commissionAmount:number;adhesionFee:number;adhesionPaid:boolean;revenueDueDate:string|null;bonus:number;sourceRow:number;raw:Record<string,unknown>};
const cents=(n:number)=>Math.round(n*100);
const source='TF PLANILHA GESTAO CLIENTES - ATUALIZADA(1).xlsx';
const batchKey='tf-updated-20260916-v1';

// Called only after the existing import-token check. One atomic, retry-safe batch.
export async function importUpdatedSheet(input:unknown){
  const rows=input as Row[];
  if(!Array.isArray(rows)||rows.length!==17)throw new Error('Esperados 17 registros na planilha atualizada.');
  const cpfs=new Set<string>();
  for(const row of rows){
    if(!row.name||!/^\d{11}$/.test(row.document)||cpfs.has(row.document)||!/^2026-(08|09)-\d{2}$/.test(row.operationDate))throw new Error('Identificação ou data inválida no lote.');
    cpfs.add(row.document);
    for(const n of [row.value,row.installment,row.commissionAmount,row.adhesionFee,row.bonus])if(!Number.isFinite(n)||n<0)throw new Error('Valor inválido no lote.');
    if(row.commissionAmount>0&&row.value<=0)throw new Error('Comissão sem base de cálculo.');
    if(row.adhesionFee>0&&!row.adhesionPaid&&!row.revenueDueDate)throw new Error('Informe o vencimento da adesão pendente.');
  }
  if(rows.filter(row=>hasGgCode(row.producer)).length!==7)throw new Error('Esperados sete contratos com código GG.');
  const owner=TF_OWNER_EMAIL,now=Date.now();
  const partner=await env.DB.prepare("SELECT id FROM partners WHERE owner_id=? AND name='GG Veículos' AND deleted_at IS NULL").bind(owner).first<{id:number}>();
  if(!partner)throw new Error('Parceiro GG Veículos não encontrado.');
  const statements=[];
  for(const row of rows){
    const fingerprint=`${batchKey}:${row.document}:${row.operationDate}`;
    const rate=row.value>0?row.commissionAmount/row.value*100:0;
    const extra={agreement:row.agreement,contractType:row.product,dueDay:row.dueDay,productionIndicator:row.productionIndicator,commissionRate:rate,commissionInstallments:1,commissionPaid:false,adhesionFeeCents:cents(row.adhesionFee),adhesionPaid:row.adhesionPaid,bonusCents:cents(row.bonus),sourceCommissionCents:cents(row.commissionAmount),sourceContractValue:row.raw['Valor do contrato'],importBatch:batchKey,sourceRow:row.sourceRow,sourceValues:row.raw};
    statements.push(env.DB.prepare(`INSERT INTO clients (owner_id,name,normalized_name,cpf,birth_date,phone,source_row,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,cpf) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,birth_date=excluded.birth_date,phone=excluded.phone,source_row=excluded.source_row,deleted_at=NULL,updated_at=excluded.updated_at`).bind(owner,row.name,row.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),row.document,row.birthDate,row.phone,source,now,now));
    statements.push(env.DB.prepare(`INSERT INTO operations (owner_id,client_id,partner_id,bank,promoter,original_product,category,producer,origin,value_cents,installment_cents,term,operation_date,paid_at,completed_at,status,notes,source_row,dedupe_fingerprint,created_at,updated_at) SELECT ?,c.id,?,?,?,?,?,?,?,?,?,?,?,?,?,'Finalizado',?,?,?,?,? FROM clients c WHERE c.owner_id=? AND c.cpf=? AND NOT EXISTS (SELECT 1 FROM operations WHERE owner_id=? AND dedupe_fingerprint=?)`).bind(owner,hasGgCode(row.producer)?partner.id:null,row.bank,row.promoter||null,row.product,row.operationType,row.producer,hasGgCode(row.producer)?'GG Veículos':'TF',cents(row.value),cents(row.installment),row.term,row.operationDate,row.paidAt,row.paidAt,JSON.stringify(extra),source,fingerprint,now,now,owner,row.document,owner,fingerprint));
    for(const item of [{label:'Comissão',amount:row.commissionAmount,paid:false,rate:Math.round(rate*100),due:row.revenueDueDate},{label:'Taxa de adesão',amount:row.adhesionFee,paid:row.adhesionPaid,rate:null,due:row.revenueDueDate},{label:'Bonificação',amount:row.bonus,paid:false,rate:null,due:row.revenueDueDate}]){
      if(item.amount<=0)continue;
      statements.push(env.DB.prepare(`INSERT INTO commissions (owner_id,operation_id,rate_bps,value_cents,expected_at,received_at,status,notes,created_at,updated_at) SELECT ?,o.id,?,?,?,?,?,?,?,? FROM operations o WHERE o.owner_id=? AND o.dedupe_fingerprint=? AND NOT EXISTS (SELECT 1 FROM commissions cm WHERE cm.operation_id=o.id AND cm.notes=? AND cm.deleted_at IS NULL)`).bind(owner,item.rate,cents(item.amount),item.due,null,item.paid?'recebida':'prevista',item.label,now,now,owner,fingerprint,item.label));
    }
  }
  await env.DB.batch(statements);
  const result=await env.DB.prepare("SELECT COUNT(*) AS operations,COUNT(DISTINCT client_id) AS clients,SUM(CASE WHEN partner_id=? THEN 1 ELSE 0 END) AS gg,SUM(value_cents) AS production_cents FROM operations WHERE owner_id=? AND dedupe_fingerprint LIKE ? AND deleted_at IS NULL").bind(partner.id,owner,`${batchKey}:%`).first();
  return {ok:true,...result as object};
}
