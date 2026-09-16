import { env } from '@/lib/runtime';
import { readOperations, completedOperationFilter, operationSelect } from '@/lib/operations';
import { operationFinance, operationNotes, revenueAmounts } from '@/lib/operation-finance';
import { getTfAccess, hasTfPermission } from '../../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache'}});

export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  const offset=Math.max(0,Math.floor(Number(params.get('offset'))||0));
  const limit=Math.max(1,Math.min(1000,Math.floor(Number(params.get('limit'))||1000)));
  if(!Number.isSafeInteger(offset)||offset>10000000)return json({error:'Página inválida.'},400);
  const user=await getTfAccess();if(!user)return json({error:'Não autorizado'},401);
  const canClients=hasTfPermission(user,'clientes'),canProduction=hasTfPermission(user,'producao')||hasTfPermission(user,'relatorios')||hasTfPermission(user,'comissoes')||hasTfPermission(user,'financeiro')||hasTfPermission(user,'parceiros');
  if(!canClients&&!canProduction)return json({clients:[],operations:[],receivables:[],nextOffset:null});
  const memberScopeField=user.partnerId?'partner_id':'assigned_user_id',memberScopeId=user.partnerId||user.memberId,memberFilter=user.role==='employee'?` AND o.${memberScopeField}=?`:'';
  const clientSql=user.role==='employee'
    ? `SELECT c.id,c.name,c.cpf,c.benefit_number,c.birth_date,c.phone,c.city FROM clients c WHERE c.owner_id IN (?,?) AND c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM operations o WHERE o.client_id=c.id AND o.owner_id IN (?,?) AND o.deleted_at IS NULL${completedOperationFilter} AND o.${memberScopeField}=?) ORDER BY c.updated_at DESC,c.id DESC LIMIT ${limit} OFFSET ${offset}`
    : `SELECT c.id,c.name,c.cpf,c.benefit_number,c.birth_date,c.phone,c.city FROM clients c WHERE c.deleted_at IS NULL AND c.owner_id IN (?,?) ORDER BY c.updated_at DESC,c.id DESC LIMIT ${limit} OFFSET ${offset}`;
  const receivableScope=` AND cm.owner_id IN (?,?)${memberFilter}`;
  const receivableSql=`SELECT cm.id,cm.operation_id,o.client_name AS name,cm.value_cents,cm.expected_at,cm.status,cm.notes,o.original_product,o.value_cents AS operation_value_cents,o.notes AS operation_notes,o.commissions,o.stored_ila_rate_bps FROM commissions cm JOIN (${operationSelect} WHERE c.deleted_at IS NULL) o ON o.id=cm.operation_id WHERE cm.deleted_at IS NULL AND o.deleted_at IS NULL AND cm.status NOT IN ('recebida','paga','cancelada','historica') AND lower(COALESCE(cm.notes,'')) NOT LIKE 'base após ila parceiro gg%' AND lower(COALESCE(cm.notes,'')) NOT LIKE 'bonificação parceiro gg%'${completedOperationFilter}${receivableScope} ORDER BY cm.expected_at ASC,cm.id ASC LIMIT ${limit} OFFSET ${offset}`;
  const [clientRows,operationRows,receivableRows]=await Promise.all([
    (canClients||canProduction)?(user.role==='employee'?env.DB.prepare(clientSql).bind(user.ownerKeys[0],user.ownerKeys[1],user.ownerKeys[0],user.ownerKeys[1],memberScopeId).all<any>():env.DB.prepare(clientSql).bind(user.ownerKeys[0],user.ownerKeys[1]).all<any>()):Promise.resolve({results:[]}),
    canProduction?readOperations(env.DB,user,{limit,offset}):Promise.resolve([]),
    canProduction?(user.role==='employee'?env.DB.prepare(receivableSql).bind(user.ownerKeys[0],user.ownerKeys[1],memberScopeId).all<any>():env.DB.prepare(receivableSql).bind(user.ownerKeys[0],user.ownerKeys[1]).all<any>()):Promise.resolve({results:[]})
  ]);
  return json({
    nextOffset:[clientRows.results.length,operationRows.length,receivableRows.results.length].some(count=>count===limit)?offset+limit:null,
    clients:clientRows.results.map((c:any)=>({id:10_000_000+c.id,dbId:c.id,name:c.name,cpf:c.cpf||'',benefit:c.benefit_number||'—',birth:c.birth_date||'1900-01-01',phone:c.phone||'Não informado',city:c.city||'',partner:'WhatsApp / Gestor TF'})),
    operations:operationRows,
    receivables:receivableRows.results.map((item:any)=>{
      const rows=item.commissions||[],finance=operationFinance(Number(item.operation_value_cents||0),operationNotes(item.operation_notes),rows,Number(item.stored_ila_rate_bps||0)/100);
      return {id:item.id,operationId:item.operation_id,name:item.name,value:(revenueAmounts(finance,rows).get(item.id)??0)/100,dueDate:item.expected_at||'',status:item.status||'prevista',type:item.notes||'Comissão',product:item.original_product||'Operação'};
    })
  });
}
