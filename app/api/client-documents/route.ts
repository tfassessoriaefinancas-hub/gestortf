import { env } from '@/lib/runtime';
import { getChatGPTUser } from '../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status});
const safe=(v:string)=>v.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);

export async function GET(request:Request){
  const user=await getChatGPTUser(); if(!user)return json({error:'Não autorizado'},401);
  const url=new URL(request.url),id=Number(url.searchParams.get('id')),clientId=Number(url.searchParams.get('clientId'));
  if(id){const row=await env.DB.prepare('SELECT file_key,file_name,mime_type FROM client_documents WHERE id=? AND owner_id=?').bind(id,user.userId).first<any>();if(!row)return json({error:'Documento não encontrado.'},404);const object=await env.FILES.get(row.file_key);if(!object)return json({error:'Arquivo não encontrado.'},404);return new Response(object.body,{headers:{'content-type':row.mime_type,'content-disposition':`inline; filename="${safe(row.file_name)}"`}})}
  if(!clientId)return json({error:'Cliente inválido.'},400);
  const rows=await env.DB.prepare('SELECT id,file_name as fileName,mime_type as mimeType,size_bytes as sizeBytes,document_type as documentType,created_at as createdAt FROM client_documents WHERE owner_id=? AND client_id=? ORDER BY created_at DESC').bind(user.userId,clientId).all();
  return json({documents:rows.results});
}

export async function POST(request:Request){
  const user=await getChatGPTUser(); if(!user)return json({error:'Não autorizado'},401);
  const form=await request.formData(), clientId=Number(form.get('clientId')), file=form.get('file');
  if(!clientId||!(file instanceof File))return json({error:'Selecione um arquivo e um cliente.'},400);
  if(file.size>15*1024*1024)return json({error:'O arquivo deve ter no máximo 15 MB.'},400);
  const client=await env.DB.prepare('SELECT id FROM clients WHERE id=? AND owner_id=? AND deleted_at IS NULL').bind(clientId,user.userId).first();
  if(!client)return json({error:'Cliente não encontrado.'},404);
  const type=String(form.get('documentType')||'outro'), key=`clients/${user.userId}/${clientId}/${Date.now()}-${safe(file.name)}`;
  await env.FILES.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||'application/octet-stream'}});
  const row=await env.DB.prepare('INSERT INTO client_documents (owner_id,client_id,file_key,file_name,mime_type,size_bytes,document_type,created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id,file_name as fileName,mime_type as mimeType,size_bytes as sizeBytes,document_type as documentType,created_at as createdAt').bind(user.userId,clientId,key,file.name,file.type||'application/octet-stream',file.size,type,Date.now()).first();
  return json({document:row},201);
}
