import { env } from '@/lib/runtime';
import { getTfAccess, getTfOwner, hasTfPermission } from '../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache'}});
const normalizedGgAdjustment=(item:any)=>{const storedIlaRate=Number(item.ila_rate_bps||0)/100,ilaRate=storedIlaRate===26?26.6:storedIlaRate,storedAfterIla=Number(item.partner_after_ila_cents||0)/100,hasStoredBase=Number(item.partner_override_count||0)>0&&storedAfterIla>0,gross=hasStoredBase&&storedIlaRate<100?storedAfterIla/(1-storedIlaRate/100):0;return {operationId:item.operation_id,ilaRate,invoiceRate:(item.invoice_rate_bps||0)/100,tfShare:(item.tf_share_bps||5000)/100,afterIlaOverride:hasStoredBase?gross*(1-ilaRate/100):null}};

export async function GET(){
  const user=await getTfAccess();
  if(!user||!hasTfPermission(user,'parceiros'))return json({error:'Não autorizado'},401);
  const rows=user.partnerId
    ?await env.DB.prepare("SELECT id,name,tax_rate_bps,invoice_rate_bps,tf_share_bps FROM partners WHERE id=? AND owner_id IN (?,?) AND active=1 AND deleted_at IS NULL").bind(user.partnerId,user.ownerKeys[0],user.ownerKeys[1]).all<{id:number;name:string;tax_rate_bps:number;invoice_rate_bps:number;tf_share_bps:number}>()
    :await env.DB.prepare("SELECT id,name,tax_rate_bps,invoice_rate_bps,tf_share_bps FROM partners WHERE owner_id IN (?,?) AND active=1 AND deleted_at IS NULL ORDER BY lower(name)").bind(user.ownerKeys[0],user.ownerKeys[1]).all<{id:number;name:string;tax_rate_bps:number;invoice_rate_bps:number;tf_share_bps:number}>();
  const settlements=user.partnerId
    ?await env.DB.prepare("SELECT partner_id,period,gross_commission_cents,fee_rate_bps,tf_share_bps,status,paid_at FROM partner_settlements WHERE partner_id=? AND owner_id IN (?,?) ORDER BY period DESC").bind(user.partnerId,user.ownerKeys[0],user.ownerKeys[1]).all<any>()
    :await env.DB.prepare("SELECT partner_id,period,gross_commission_cents,fee_rate_bps,tf_share_bps,status,paid_at FROM partner_settlements WHERE owner_id IN (?,?) ORDER BY period DESC").bind(user.ownerKeys[0],user.ownerKeys[1]).all<any>();
  const adjustmentSql="SELECT a.partner_id,a.operation_id,a.ila_rate_bps,a.invoice_rate_bps,a.tf_share_bps,COALESCE((SELECT SUM(cm.value_cents) FROM commissions cm WHERE cm.operation_id=a.operation_id AND cm.deleted_at IS NULL AND cm.rate_bps IS NULL AND lower(COALESCE(cm.notes,'')) LIKE 'base após ila parceiro gg%'),0) AS partner_after_ila_cents,COALESCE((SELECT COUNT(*) FROM commissions cm WHERE cm.operation_id=a.operation_id AND cm.deleted_at IS NULL AND cm.rate_bps IS NULL AND lower(COALESCE(cm.notes,'')) LIKE 'base após ila parceiro gg%'),0) AS partner_override_count FROM partner_operation_adjustments a";
  const adjustments=user.partnerId
    ?await env.DB.prepare(`${adjustmentSql} WHERE a.partner_id=? AND a.owner_id IN (?,?)`).bind(user.partnerId,user.ownerKeys[0],user.ownerKeys[1]).all<any>()
    :await env.DB.prepare(`${adjustmentSql} WHERE a.owner_id IN (?,?)`).bind(user.ownerKeys[0],user.ownerKeys[1]).all<any>();
  const bonuses=user.partnerId
    ?await env.DB.prepare("SELECT o.partner_id,substr(cm.expected_at,1,7) AS period,SUM(cm.value_cents) AS value_cents,MAX(cm.notes) AS description FROM commissions cm JOIN operations o ON o.id=cm.operation_id WHERE cm.deleted_at IS NULL AND cm.rate_bps IS NULL AND lower(COALESCE(cm.notes,'')) LIKE 'bonificação parceiro gg%' AND o.partner_id=? GROUP BY o.partner_id,substr(cm.expected_at,1,7)").bind(user.partnerId).all<any>()
    :await env.DB.prepare("SELECT o.partner_id,substr(cm.expected_at,1,7) AS period,SUM(cm.value_cents) AS value_cents,MAX(cm.notes) AS description FROM commissions cm JOIN operations o ON o.id=cm.operation_id WHERE cm.deleted_at IS NULL AND cm.rate_bps IS NULL AND lower(COALESCE(cm.notes,'')) LIKE 'bonificação parceiro gg%' GROUP BY o.partner_id,substr(cm.expected_at,1,7)").all<any>();
  return json({partners:rows.results.map(row=>({id:row.id,name:row.name,taxRate:(row.tax_rate_bps||0)/100,invoiceRate:(row.invoice_rate_bps||0)/100,tfShare:(row.tf_share_bps||5000)/100,settlements:settlements.results.filter((item:any)=>item.partner_id===row.id).map((item:any)=>({period:item.period,grossCommission:(item.gross_commission_cents||0)/100,feeRate:(item.fee_rate_bps||201)/100,tfShare:(item.tf_share_bps||5000)/100,status:item.status||'em_aberto',paidAt:item.paid_at||''})),adjustments:adjustments.results.filter((item:any)=>item.partner_id===row.id).map(normalizedGgAdjustment),bonuses:bonuses.results.filter((item:any)=>item.partner_id===row.id).map((item:any)=>({period:item.period,value:(item.value_cents||0)/100,description:item.description||'Bonificação'}))}))});
}

export async function POST(request:Request){
  const user=await getTfOwner();
  if(!user)return json({error:'Não autorizado'},401);
  const body=await request.json() as {name?:string},name=String(body.name||'').trim();
  if(name.length<2)return json({error:'Informe o nome do parceiro.'},400);
  const existing=await env.DB.prepare("SELECT id,name,tax_rate_bps,invoice_rate_bps,tf_share_bps FROM partners WHERE owner_id IN (?,?) AND lower(name)=lower(?) AND deleted_at IS NULL LIMIT 1").bind(user.ownerKey,user.email,name).first<{id:number;name:string;tax_rate_bps:number;invoice_rate_bps:number;tf_share_bps:number}>();
  if(existing)return json({partner:{id:existing.id,name:existing.name,taxRate:(existing.tax_rate_bps||0)/100,invoiceRate:(existing.invoice_rate_bps||0)/100,tfShare:(existing.tf_share_bps||5000)/100}});
  const now=Date.now(),partner=await env.DB.prepare("INSERT INTO partners (owner_id,name,active,created_at,updated_at) VALUES (?,?,1,?,?) RETURNING id,name").bind(user.ownerKey,name,now,now).first<{id:number;name:string}>();
  return partner?json({partner:{...partner,taxRate:0,invoiceRate:0,tfShare:50}},201):json({error:'Não foi possível cadastrar o parceiro.'},500);
}

export async function PATCH(request:Request){
  const user=await getTfOwner();if(!user)return json({error:'Não autorizado'},401);
  const body=await request.json() as {id?:number;operationId?:number;ilaRate?:number;taxRate?:number;invoiceRate?:number;tfShare?:number;period?:string;status?:string;grossCommission?:number},id=Number(body.id);if(!id)return json({error:'Parceiro inválido.'},400);
  const clamp=(value:unknown)=>Math.max(0,Math.min(100,Number(value||0)));
  if(Number(body.operationId)>0){const operationId=Number(body.operationId),owned=await env.DB.prepare("SELECT id FROM operations WHERE id=? AND owner_id IN (?,?) AND deleted_at IS NULL AND (partner_id=? OR lower(origin)=(SELECT lower(name) FROM partners WHERE id=?))").bind(operationId,user.ownerKey,user.email,id,id).first();if(!owned)return json({error:'Operação do parceiro não encontrada.'},404);const ilaRate=clamp(body.ilaRate),invoiceRate=clamp(body.invoiceRate),tfShare=clamp(body.tfShare||50),now=Date.now();await env.DB.prepare("INSERT INTO partner_operation_adjustments (owner_id,partner_id,operation_id,ila_rate_bps,invoice_rate_bps,tf_share_bps,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(operation_id) DO UPDATE SET partner_id=excluded.partner_id,ila_rate_bps=excluded.ila_rate_bps,invoice_rate_bps=excluded.invoice_rate_bps,tf_share_bps=excluded.tf_share_bps,updated_at=excluded.updated_at").bind(user.ownerKey,id,operationId,Math.round(ilaRate*100),Math.round(invoiceRate*100),Math.round(tfShare*100),now,now).run();return json({adjustment:{operationId,ilaRate,invoiceRate,tfShare}});}
  if(/^\d{4}-\d{2}$/.test(String(body.period||''))){const owned=await env.DB.prepare("SELECT id FROM partners WHERE id=? AND owner_id IN (?,?) AND deleted_at IS NULL").bind(id,user.ownerKey,user.email).first();if(!owned)return json({error:'Parceiro não encontrado.'},404);const period=String(body.period),status=body.status==='pago'?'pago':'em_aberto',paidAt=status==='pago'?new Date().toISOString().slice(0,10):null,now=Date.now(),gross=Math.max(0,Math.round(Number(body.grossCommission||0)*100));await env.DB.prepare("INSERT INTO partner_settlements (owner_id,partner_id,period,gross_commission_cents,fee_rate_bps,tf_share_bps,status,paid_at,created_at,updated_at) VALUES (?,?,?,?,201,5000,?,?,?,?) ON CONFLICT(partner_id,period) DO UPDATE SET gross_commission_cents=excluded.gross_commission_cents,status=excluded.status,paid_at=excluded.paid_at,updated_at=excluded.updated_at").bind(user.ownerKey,id,period,gross,status,paidAt,now,now).run();return json({settlement:{period,status,paidAt,grossCommission:gross/100,feeRate:2.01,tfShare:50}});}
  const taxRate=clamp(body.taxRate),invoiceRate=clamp(body.invoiceRate),tfShare=clamp(body.tfShare),now=Date.now();
  const partner=await env.DB.prepare("UPDATE partners SET tax_rate_bps=?,invoice_rate_bps=?,tf_share_bps=?,updated_at=? WHERE id=? AND owner_id IN (?,?) AND deleted_at IS NULL RETURNING id,name").bind(Math.round(taxRate*100),Math.round(invoiceRate*100),Math.round(tfShare*100),now,id,user.ownerKey,user.email).first<{id:number;name:string}>();
  return partner?json({partner:{...partner,taxRate,invoiceRate,tfShare}}):json({error:'Parceiro não encontrado.'},404);
}
