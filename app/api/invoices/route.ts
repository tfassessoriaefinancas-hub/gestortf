import { env } from '@/lib/runtime';
import { toCents } from '@/lib/money';
import { getTfAccess, hasTfPermission } from '../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache'}});

const safe=(value:string)=>value.replace(/[\r\n"]/g,'_');
export async function GET(request:Request){
  const user=await getTfAccess();
  if(!user||!hasTfPermission(user,'notas'))return json({error:'Não autorizado'},401);
  const id=Number(new URL(request.url).searchParams.get('id'));
  if(id){const row=await env.DB.prepare('SELECT file_key,file_name FROM invoices WHERE id=? AND owner_id IN (?,?) AND deleted_at IS NULL').bind(id,user.ownerKeys[0],user.ownerKeys[1]).first<{file_key:string|null;file_name:string|null}>();if(!row?.file_key)return json({error:'Arquivo da nota não encontrado.'},404);const object=await env.FILES.get(row.file_key);if(!object)return json({error:'Arquivo da nota não encontrado.'},404);return new Response(object.body,{headers:{'content-type':'application/octet-stream','content-disposition':`inline; filename="${safe(row.file_name||'nota-fiscal')}"`}})}
  const scope=user.partnerId?' AND i.partner_id=?':'';
  const statement=env.DB.prepare(`SELECT i.id,i.number,i.value_cents,i.issued_at,i.paid_at,i.status,i.file_name,c.name client_name,p.name partner_name FROM invoices i LEFT JOIN clients c ON c.id=i.client_id LEFT JOIN partners p ON p.id=i.partner_id WHERE i.owner_id IN (?,?) AND i.deleted_at IS NULL${scope} ORDER BY COALESCE(i.issued_at,'') DESC,i.id DESC`);
  const rows=await (user.partnerId?statement.bind(user.ownerKeys[0],user.ownerKeys[1],user.partnerId):statement.bind(user.ownerKeys[0],user.ownerKeys[1])).all<any>();
  return json({invoices:rows.results.map((row:any)=>({id:row.id,number:row.number,clientName:row.client_name||'Cliente',partnerName:row.partner_name||'',value:(row.value_cents||0)/100,issuedAt:row.issued_at||'',paidAt:row.paid_at||'',status:row.status||'pendente',fileName:row.file_name||''}))});
}

export async function POST(request:Request){
  const user=await getTfAccess();
  if(!user||!hasTfPermission(user,'notas'))return json({error:'Não autorizado'},401);
  const form=await request.formData(),clientId=Number(form.get('clientId')),file=form.get('file');
  if(!clientId)return json({error:'Selecione o cliente.'},400);
  if(!(file instanceof File)||!file.size)return json({error:'Selecione o arquivo da nota fiscal.'},400);
  if(file.size>8*1024*1024)return json({error:'O arquivo deve ter no máximo 8 MB.'},400);
  const client=await env.DB.prepare('SELECT id,name FROM clients WHERE id=? AND owner_id IN (?,?) AND deleted_at IS NULL').bind(clientId,user.ownerKeys[0],user.ownerKeys[1]).first<{id:number;name:string}>();
  if(!client)return json({error:'Cliente não encontrado.'},404);
  const now=Date.now(),issuedAt=String(form.get('issuedAt')||new Date().toISOString().slice(0,10)),number=String(form.get('number')||`ANEXO-${now}`).trim(),status=String(form.get('status')||'pendente')==='paga'?'paga':'pendente',valueCents=Math.max(0,toCents(form.get('value'))),key=`invoices/${user.ownerKey}/${now}-${crypto.randomUUID()}`;
  await env.FILES.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||'application/octet-stream'}});
  try{
    const row=await env.DB.prepare('INSERT INTO invoices (owner_id,number,client_id,value_cents,issued_at,paid_at,status,file_key,file_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id').bind(user.ownerKey,number,client.id,valueCents,issuedAt,status==='paga'?issuedAt:null,status,key,file.name,now,now).first<{id:number}>();
    return json({invoice:{id:row?.id,number,clientName:client.name,partnerName:'',value:valueCents/100,issuedAt,paidAt:status==='paga'?issuedAt:'',status,fileName:file.name}},201);
  }catch(error){await env.FILES.delete(key).catch(()=>{});throw error;}
}
