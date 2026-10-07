import { env } from '@/lib/runtime';
import { readOperations } from '@/lib/operations';
import { importedPartnerFinance } from '@/lib/operation-finance';
import { hasGgCode } from '@/lib/production-source';
import { getTfAccess, hasTfPermission } from '../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache'}});

type PartnerRow={id:number;owner_id:string;name:string};

export async function POST(request:Request){
  const user=await getTfAccess();
  if(!user)return json({error:'Entre no sistema para acessar o relatório.'},401);
  if(!hasTfPermission(user,'relatorios')&&!hasTfPermission(user,'parceiros'))return json({error:'Acesso não autorizado.'},403);

  let requestedPartnerId=0;
  try { const body=await request.json() as Record<string,unknown>; requestedPartnerId=Number(body.partnerId||0); } catch { requestedPartnerId=Number(new URL(request.url).searchParams.get('partner')||0); }
  let partner=requestedPartnerId>0
    ?await env.DB.prepare("SELECT id,owner_id,name FROM partners WHERE id=? AND owner_id IN (?,?) AND active=1 AND deleted_at IS NULL").bind(requestedPartnerId,user.ownerKeys[0],user.ownerKeys[1]).first<PartnerRow>()
    :await env.DB.prepare("SELECT id,owner_id,name FROM partners WHERE owner_id IN (?,?) AND active=1 AND deleted_at IS NULL AND (lower(name) LIKE '%gg veículos%' OR lower(name) LIKE '%germano%' OR lower(name) LIKE '%gg%') ORDER BY CASE WHEN lower(name) LIKE '%gg veículos%' THEN 0 WHEN lower(name) LIKE '%germano%' THEN 1 ELSE 2 END LIMIT 1").bind(user.ownerKeys[0],user.ownerKeys[1]).first<PartnerRow>();
  if(!partner && !requestedPartnerId){
    const source=await env.DB.prepare("SELECT 0 AS id,owner_id,origin AS name FROM operations WHERE owner_id IN (?,?) AND deleted_at IS NULL AND (lower(origin) LIKE '%gg veículos%' OR lower(origin) LIKE '%germano%' OR lower(origin) LIKE '%gg%') LIMIT 1").bind(user.ownerKeys[0],user.ownerKeys[1]).first<PartnerRow>();
    partner=source||null;
  }
  if(!partner)return json({error:'Parceiro GG Veículos não encontrado.'},404);
  if(!user.ownerKeys.includes(partner.owner_id)||(user.role!=='admin'&&user.partnerId!==partner.id))return json({error:'Acesso não autorizado.'},403);

  const rows=await readOperations(env.DB,user);
  const operations=rows.filter(row=>requestedPartnerId>0
    ?row.partnerId===partner!.id||row.origin.localeCompare(partner!.name,'pt-BR',{sensitivity:'base'})===0
    :row.partnerId===partner!.id||row.origin.localeCompare(partner!.name,'pt-BR',{sensitivity:'base'})===0||hasGgCode(row.producer)||/gg veículos|germano/i.test(row.origin)
  ).map(row=>({
    id:row.dbId,clientName:row.clientName,cpf:row.clientCpf,bank:row.bank,product:row.product,date:row.date,paidDate:row.paidDate,value:row.value,producer:row.producer,origin:row.origin,
    commissionRate:row.commissionRate,
    ...importedPartnerFinance(row.grossCommission,row.ilaRate,row.invoiceRate,row.tfShare,row.importedAfterIla,row.importedNet,row.importedRepasse),
  }));
  const settlements=partner.id>0?(await env.DB.prepare("SELECT period,bonus_cents,bonus_description,deduction_cents,deduction_description FROM partner_settlements WHERE partner_id=? AND owner_id IN (?,?) ORDER BY period DESC").bind(partner.id,user.ownerKeys[0],user.ownerKeys[1]).all<any>()).results:[];
  const normalizedSettlements=settlements.map(item=>({period:item.period,bonus:Number(item.bonus_cents||0)/100,bonusDescription:item.bonus_description||'',deduction:Number(item.deduction_cents||0)/100,deductionDescription:item.deduction_description||''}));
  const periods=Array.from(new Set([...operations.map(item=>item.date.slice(0,7)),...normalizedSettlements.map(item=>item.period)].filter(period=>/^\d{4}-\d{2}$/.test(period)))).sort((a,b)=>b.localeCompare(a));
  return json({partner:{id:partner.id,name:partner.name},periods,operations,settlements:normalizedSettlements});
}
