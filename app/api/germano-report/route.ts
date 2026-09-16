import { env } from '@/lib/runtime';
import { getTfAccess, hasTfPermission } from '../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache'}});

type PartnerRow={id:number;owner_id:string;name:string};

export async function POST(request:Request){
  const user=await getTfAccess();
  if(!user)return json({error:'Entre no sistema para acessar o relatório.'},401);
  if(!hasTfPermission(user,'relatorios')&&!hasTfPermission(user,'parceiros'))return json({error:'Acesso não autorizado.'},403);

  let partner=await env.DB.prepare("SELECT id,owner_id,name FROM partners WHERE active=1 AND deleted_at IS NULL AND (lower(name) LIKE '%gg veículos%' OR lower(name) LIKE '%germano%' OR lower(name) LIKE '%gg%') ORDER BY CASE WHEN lower(name) LIKE '%gg veículos%' THEN 0 WHEN lower(name) LIKE '%germano%' THEN 1 ELSE 2 END LIMIT 1").first<PartnerRow>();
  if(!partner){
    const source=await env.DB.prepare("SELECT 0 AS id,owner_id,origin AS name FROM operations WHERE deleted_at IS NULL AND (lower(origin) LIKE '%gg veículos%' OR lower(origin) LIKE '%germano%' OR lower(origin) LIKE '%gg%') LIMIT 1").first<PartnerRow>();
    partner=source||null;
  }
  if(!partner)return json({error:'Parceiro GG Veículos não encontrado.'},404);
  if(!user.ownerKeys.includes(partner.owner_id)||(user.role!=='admin'&&user.partnerId!==partner.id))return json({error:'Acesso não autorizado.'},403);

  const rows=await env.DB.prepare(`SELECT o.id,c.name AS client_name,c.cpf,o.bank,o.original_product,o.operation_date,o.value_cents,
    COALESCE((SELECT SUM(value_cents) FROM commissions cm WHERE cm.operation_id=o.id AND cm.owner_id=o.owner_id AND cm.deleted_at IS NULL AND cm.rate_bps IS NOT NULL),0) AS gross_cents,
    COALESCE((SELECT SUM(value_cents) FROM commissions cm WHERE cm.operation_id=o.id AND cm.deleted_at IS NULL AND cm.rate_bps IS NULL AND lower(COALESCE(cm.notes,'')) LIKE 'base após ila parceiro gg%'),0) AS partner_after_ila_cents,
    COALESCE((SELECT COUNT(*) FROM commissions cm WHERE cm.operation_id=o.id AND cm.deleted_at IS NULL AND cm.rate_bps IS NULL AND lower(COALESCE(cm.notes,'')) LIKE 'base após ila parceiro gg%'),0) AS partner_override_count,
    COALESCE(a.ila_rate_bps,0) AS ila_rate_bps,
    COALESCE(a.invoice_rate_bps,CASE WHEN lower(COALESCE(o.bank,'')) LIKE '%omni%' THEN 0 ELSE 201 END) AS invoice_rate_bps,
    COALESCE((SELECT MAX(rate_bps) FROM commissions cm WHERE cm.operation_id=o.id AND cm.owner_id=o.owner_id AND cm.deleted_at IS NULL),0) AS commission_rate_bps,
    COALESCE(a.tf_share_bps,5000) AS tf_share_bps,o.notes
    FROM operations o JOIN clients c ON c.id=o.client_id
    LEFT JOIN partner_operation_adjustments a ON a.operation_id=o.id AND a.partner_id=?
    WHERE o.deleted_at IS NULL AND c.deleted_at IS NULL AND o.report_excluded=0 AND (o.completed_at IS NOT NULL OR o.is_historical=1)
      AND (o.partner_id=? OR lower(trim(COALESCE(o.origin,'')))=lower(trim(?)) OR lower(COALESCE(o.origin,'')) LIKE '%gg veículos%' OR lower(COALESCE(o.origin,'')) LIKE '%germano%' OR lower(COALESCE(o.origin,'')) LIKE '%gg%')
    ORDER BY o.operation_date DESC,o.id DESC`).bind(partner.id,partner.id,partner.name).all<any>();

  const operations=rows.results.map(row=>{
    let extra:any={};try{extra=JSON.parse(row.notes||'{}')}catch{}
    const value=Number(row.value_cents||0)/100,commissionRate=Number(extra.commissionRate||Number(row.commission_rate_bps||0)/100||0),storedGross=Number(row.gross_cents||0)/100,storedIlaRate=Number(row.ila_rate_bps||0)/100,ilaRate=storedIlaRate===26?26.6:storedIlaRate,invoiceRate=Number(row.invoice_rate_bps||0)/100,tfShare=Number(row.tf_share_bps||5000)/100,storedAfterIla=Number(row.partner_after_ila_cents||0)/100,hasOverride=Number(row.partner_override_count||0)>0&&storedAfterIla>0,gross=hasOverride?(storedIlaRate<100?storedAfterIla/(1-storedIlaRate/100):storedAfterIla):(storedGross||value*commissionRate/100),ilaValue=gross*ilaRate/100,afterIla=Math.max(0,gross-ilaValue),invoiceFee=afterIla*invoiceRate/100,net=Math.max(0,afterIla-invoiceFee),thiagoShare=net*tfShare/100;
    return {id:Number(row.id),clientName:String(row.client_name||'Cliente'),cpf:String(row.cpf||''),bank:String(row.bank||'Não informado'),product:String(row.original_product||'Operação'),date:String(row.operation_date||''),value,gross,ilaRate,ilaValue,afterIla,invoiceRate,invoiceFee,net,thiagoShare,partnerShare:Math.max(0,net-thiagoShare)};
  });
  const bonusRows=await env.DB.prepare(`SELECT cm.id,cm.value_cents,cm.expected_at FROM commissions cm JOIN operations o ON o.id=cm.operation_id WHERE cm.deleted_at IS NULL AND cm.rate_bps IS NULL AND lower(COALESCE(cm.notes,'')) LIKE 'bonificação parceiro gg%' AND (o.partner_id=? OR lower(COALESCE(o.origin,'')) LIKE '%gg%') ORDER BY cm.expected_at DESC`).bind(partner.id).all<any>();
  for(const bonus of bonusRows.results){const value=Number(bonus.value_cents||0)/100,date=String(bonus.expected_at||'');operations.push({id:-Number(bonus.id),clientName:'Campanha GG Veículos',cpf:'',bank:'Seguro',product:'Bonificação de seguro',date,value:0,gross:0,ilaRate:0,ilaValue:0,afterIla:0,invoiceRate:0,invoiceFee:0,net:value,thiagoShare:value/2,partnerShare:value/2});}
  const periods=Array.from(new Set(operations.map(item=>item.date.slice(0,7)).filter(period=>/^\d{4}-\d{2}$/.test(period)))).sort((a,b)=>b.localeCompare(a));
  return json({partner:{id:partner.id,name:partner.name},periods,operations});
}
