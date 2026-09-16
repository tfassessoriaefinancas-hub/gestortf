import { env } from '@/lib/runtime';
import { getTfAccess, hasTfPermission } from '../../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache'}});

export async function GET(){
  const user=await getTfAccess();if(!user)return json({error:'Não autorizado'},401);
  const canClients=hasTfPermission(user,'clientes'),canProduction=hasTfPermission(user,'producao')||hasTfPermission(user,'relatorios')||hasTfPermission(user,'comissoes')||hasTfPermission(user,'financeiro');
  if(!canClients&&!canProduction)return json({clients:[],operations:[]});
  const memberScopeField=user.partnerId?'partner_id':'assigned_user_id',memberScopeId=user.partnerId||user.memberId,memberFilter=user.role==='employee'?` AND o.${memberScopeField}=?`:'';
  const completedOperationFilter=" AND o.completed_at IS NOT NULL";
  const clientSql=user.role==='employee'
    ? `SELECT DISTINCT c.id,c.name,c.cpf,c.benefit_number,c.birth_date,c.phone,c.city FROM clients c WHERE c.owner_id IN (?,?) AND c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM operations o WHERE o.client_id=c.id AND o.owner_id IN (?,?) AND o.deleted_at IS NULL${completedOperationFilter} AND o.${memberScopeField}=?) ORDER BY c.updated_at DESC`
    : `SELECT c.id,c.name,c.cpf,c.benefit_number,c.birth_date,c.phone,c.city FROM clients c WHERE c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM operations o WHERE o.client_id=c.id AND o.deleted_at IS NULL${completedOperationFilter}) ORDER BY c.updated_at DESC`;
  const operationScope=user.role==='employee'?` AND o.owner_id IN (?,?)${memberFilter}`:'';
  const commissionScope=user.role==='employee'?' AND cm.owner_id=o.owner_id':'';
  const opSql=`SELECT o.id,o.assigned_user_id,o.client_id,o.partner_id,c.cpf as client_cpf,o.original_product,o.category,o.bank,o.promoter,o.producer,o.origin,o.value_cents,o.installment_cents,o.term,o.operation_date,o.paid_at,o.status,o.notes,COALESCE((SELECT SUM(value_cents) FROM commissions cm WHERE cm.operation_id=o.id${commissionScope} AND cm.deleted_at IS NULL AND (cm.rate_bps IS NOT NULL OR cm.notes IN ('Taxa de adesão','Taxa de assessoria','Bonificação'))),0) as commission_cents,COALESCE((SELECT MAX(rate_bps) FROM commissions cm WHERE cm.operation_id=o.id${commissionScope} AND cm.deleted_at IS NULL),0) as commission_rate_bps,COALESCE((SELECT COUNT(*) FROM commissions cm WHERE cm.operation_id=o.id${commissionScope} AND cm.deleted_at IS NULL AND (cm.rate_bps IS NOT NULL OR cm.notes IN ('Taxa de adesão','Taxa de assessoria','Bonificação')) AND cm.status NOT IN ('recebida','paga')),0) as commission_pending_count,COALESCE((SELECT MIN(expected_at) FROM commissions cm WHERE cm.operation_id=o.id${commissionScope} AND cm.deleted_at IS NULL),'') as revenue_due_date FROM operations o JOIN clients c ON c.id=o.client_id WHERE o.deleted_at IS NULL${completedOperationFilter}${operationScope} ORDER BY o.updated_at DESC`;
  const receivableScope=user.role==='employee'?` AND cm.owner_id IN (?,?)${memberFilter}`:'';
  const receivableSql=`SELECT cm.id,cm.operation_id,c.name,cm.value_cents,cm.expected_at,cm.status,cm.notes,o.original_product FROM commissions cm JOIN operations o ON o.id=cm.operation_id JOIN clients c ON c.id=o.client_id WHERE cm.deleted_at IS NULL AND cm.status NOT IN ('recebida','paga','cancelada')${completedOperationFilter}${receivableScope} ORDER BY cm.expected_at ASC`;
  const [clientRows,operationRows,receivableRows]=await Promise.all([
    (canClients||canProduction)?(user.role==='employee'?env.DB.prepare(clientSql).bind(user.ownerKeys[0],user.ownerKeys[1],user.ownerKeys[0],user.ownerKeys[1],memberScopeId).all<any>():env.DB.prepare(clientSql).all<any>()):Promise.resolve({results:[]}),
    canProduction?(user.role==='employee'?env.DB.prepare(opSql).bind(user.ownerKeys[0],user.ownerKeys[1],memberScopeId).all<any>():env.DB.prepare(opSql).all<any>()):Promise.resolve({results:[]}),
    canProduction?(user.role==='employee'?env.DB.prepare(receivableSql).bind(user.ownerKeys[0],user.ownerKeys[1],memberScopeId).all<any>():env.DB.prepare(receivableSql).all<any>()):Promise.resolve({results:[]})
  ]);
  return json({
    clients:clientRows.results.map((c:any)=>({id:10_000_000+c.id,dbId:c.id,name:c.name,cpf:c.cpf||'',benefit:c.benefit_number||'—',birth:c.birth_date||'1900-01-01',phone:c.phone||'Não informado',city:c.city||'',partner:'WhatsApp / Gestor TF'})),
    operations:operationRows.results.map((o:any)=>{
      let extra:any={};
      try{extra=JSON.parse(o.notes||'{}')}catch{}
      const commissionRate=Number(extra.commissionRate||o.commission_rate_bps/100||0),
        storedCommission=Number(o.commission_cents||0),
        calculatedCommission=Math.round(Number(o.value_cents||0)*commissionRate/100),
        fees=Number(extra.adhesionFeeCents||0)+Number(extra.advisoryFeeCents||0)+Number(extra.bonusCents||0),
        commissionCents=storedCommission||calculatedCommission+fees;
      return {id:20_000_000+o.id,dbId:o.id,assignedUserId:o.assigned_user_id,clientId:10_000_000+o.client_id,partnerId:o.partner_id||null,clientCpf:o.client_cpf||'',product:o.original_product||'Operação',operationType:o.category||'',agreement:extra.agreement||'',contractType:extra.contractType||o.original_product||'',dueDay:extra.dueDay||'',bank:o.bank||'Não informado',promoter:o.promoter||'',producer:o.producer||'TF',productionIndicator:extra.productionIndicator||'',origin:o.origin||'Gestor TF',value:(o.value_cents||0)/100,installment:(o.installment_cents||0)/100,term:o.term||0,date:o.operation_date||'1900-01-01',paidDate:o.paid_at||'',status:o.status||'em_atendimento',commission:commissionCents/100,commissionRate,commissionInstallments:Number(extra.commissionInstallments||1),commissionPaid:Boolean(extra.commissionPaid)||((o.commission_cents||0)>0&&Number(o.commission_pending_count||0)===0),quotaQuantity:Number(extra.quotaQuantity||0),quotaUnitValue:(extra.quotaUnitValueCents||0)/100,fipeValue:(extra.fipeValueCents||0)/100,revenueDueDate:o.revenue_due_date||'',adhesionFee:(extra.adhesionFeeCents||0)/100,advisoryFee:(extra.advisoryFeeCents||0)/100,bonus:(extra.bonusCents||0)/100,postSale:extra.postSale||'',postSaleNotes:extra.postSaleNotes||''};
    }),
    receivables:receivableRows.results.map((item:any)=>({id:item.id,operationId:item.operation_id,name:item.name,value:(item.value_cents||0)/100,dueDate:item.expected_at||'',status:item.status||'prevista',type:item.notes||'Comissão',product:item.original_product||'Operação'}))
  });
}
