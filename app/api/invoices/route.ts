import { env } from '@/lib/runtime';
import { getTfAccess, hasTfPermission } from '../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache'}});

export async function GET(){
  const user=await getTfAccess();
  if(!user||!hasTfPermission(user,'notas'))return json({error:'Não autorizado'},401);
  const scope=user.partnerId?' AND i.partner_id=?':'';
  const statement=env.DB.prepare(`SELECT i.id,i.number,i.value_cents,i.issued_at,i.paid_at,i.status,i.file_name,c.name client_name,p.name partner_name FROM invoices i LEFT JOIN clients c ON c.id=i.client_id LEFT JOIN partners p ON p.id=i.partner_id WHERE i.owner_id IN (?,?) AND i.deleted_at IS NULL${scope} ORDER BY COALESCE(i.issued_at,'') DESC,i.id DESC`);
  const rows=await (user.partnerId?statement.bind(user.ownerKeys[0],user.ownerKeys[1],user.partnerId):statement.bind(user.ownerKeys[0],user.ownerKeys[1])).all<any>();
  return json({invoices:rows.results.map((row:any)=>({id:row.id,number:row.number,clientName:row.client_name||'Cliente',partnerName:row.partner_name||'',value:(row.value_cents||0)/100,issuedAt:row.issued_at||'',paidAt:row.paid_at||'',status:row.status||'pendente',fileName:row.file_name||''}))});
}
