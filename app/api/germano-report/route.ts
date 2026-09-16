import { env } from '@/lib/runtime';
import { readOperations } from '@/lib/operations';
import { partnerFinance } from '@/lib/operation-finance';
import { hasGgCode } from '@/lib/production-source';
import { getTfAccess, hasTfPermission } from '../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache'}});

type PartnerRow={id:number;owner_id:string;name:string};

export async function POST(){
  const user=await getTfAccess();
  if(!user)return json({error:'Entre no sistema para acessar o relatório.'},401);
  if(!hasTfPermission(user,'relatorios')&&!hasTfPermission(user,'parceiros'))return json({error:'Acesso não autorizado.'},403);

  let partner=await env.DB.prepare("SELECT id,owner_id,name FROM partners WHERE owner_id IN (?,?) AND active=1 AND deleted_at IS NULL AND (lower(name) LIKE '%gg veículos%' OR lower(name) LIKE '%germano%' OR lower(name) LIKE '%gg%') ORDER BY CASE WHEN lower(name) LIKE '%gg veículos%' THEN 0 WHEN lower(name) LIKE '%germano%' THEN 1 ELSE 2 END LIMIT 1").bind(user.ownerKeys[0],user.ownerKeys[1]).first<PartnerRow>();
  if(!partner){
    const source=await env.DB.prepare("SELECT 0 AS id,owner_id,origin AS name FROM operations WHERE owner_id IN (?,?) AND deleted_at IS NULL AND (lower(origin) LIKE '%gg veículos%' OR lower(origin) LIKE '%germano%' OR lower(origin) LIKE '%gg%') LIMIT 1").bind(user.ownerKeys[0],user.ownerKeys[1]).first<PartnerRow>();
    partner=source||null;
  }
  if(!partner)return json({error:'Parceiro GG Veículos não encontrado.'},404);
  if(!user.ownerKeys.includes(partner.owner_id)||(user.role!=='admin'&&user.partnerId!==partner.id))return json({error:'Acesso não autorizado.'},403);

  const rows=await readOperations(env.DB,user);
  const operations=rows.filter(row=>row.partnerId===partner!.id||row.origin.localeCompare(partner!.name,'pt-BR',{sensitivity:'base'})===0||hasGgCode(row.producer)||/gg veículos|germano/i.test(row.origin)).map(row=>({
    id:row.dbId,clientName:row.clientName,cpf:row.clientCpf,bank:row.bank,product:row.product,date:row.date,value:row.value,
    commissionRate:row.commissionRate,
    ...partnerFinance(row.grossCommission,row.ilaRate,row.invoiceRate,row.tfShare),
  }));
  const bonusRows=await env.DB.prepare(`SELECT cm.id,cm.value_cents,cm.expected_at FROM commissions cm JOIN operations o ON o.id=cm.operation_id WHERE cm.deleted_at IS NULL AND cm.rate_bps IS NULL AND lower(COALESCE(cm.notes,'')) LIKE 'bonificação parceiro gg%' AND o.deleted_at IS NULL AND o.owner_id IN (?,?) AND (o.partner_id=? OR lower(COALESCE(o.origin,'')) LIKE '%gg%') ORDER BY cm.expected_at DESC`).bind(user.ownerKeys[0],user.ownerKeys[1],partner.id).all<any>();
  for(const bonus of bonusRows.results){const value=Number(bonus.value_cents||0)/100,date=String(bonus.expected_at||'');operations.push({id:-Number(bonus.id),clientName:'Campanha GG Veículos',cpf:'',bank:'Seguro',product:'Bonificação de seguro',date,value:0,commissionRate:0,tfShare:50,gross:0,ilaRate:0,ilaValue:0,afterIla:0,invoiceRate:0,invoiceFee:0,net:value,thiagoShare:value/2,partnerShare:value/2});}
  const periods=Array.from(new Set(operations.map(item=>item.date.slice(0,7)).filter(period=>/^\d{4}-\d{2}$/.test(period)))).sort((a,b)=>b.localeCompare(a));
  return json({partner:{id:partner.id,name:partner.name},periods,operations});
}
