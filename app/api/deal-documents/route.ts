import { env } from '@/lib/runtime';
import { getChatGPTUser } from '../../chatgpt-auth';
const json=(data:unknown,status=200)=>Response.json(data,{status});
const safe=(v:string)=>v.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);

export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Não autorizado'},401);
 const url=new URL(request.url),id=Number(url.searchParams.get('id')),dealId=Number(url.searchParams.get('dealId'));
 if(id){
  const row=await env.DB.prepare('SELECT file_key,file_name,mime_type FROM deal_documents WHERE id=? AND owner_id=?').bind(id,user.userId).first<any>();
  if(!row)return json({error:'Documento não encontrado.'},404);
  const object=await env.FILES.get(row.file_key);if(!object)return json({error:'Arquivo não encontrado.'},404);
  return new Response(object.body,{headers:{'content-type':row.mime_type,'content-disposition':`inline; filename="${safe(row.file_name)}"`}});
 }
 if(!dealId)return json({error:'Atendimento inválido.'},400);
 const rows=await env.DB.prepare('SELECT id,file_name as fileName,mime_type as mimeType,size_bytes as sizeBytes,document_type as documentType,created_at as createdAt FROM deal_documents WHERE owner_id=? AND deal_id=? ORDER BY created_at DESC').bind(user.userId,dealId).all();
 return json({documents:rows.results});
}

export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Não autorizado'},401);
 const form=await request.formData(),dealId=Number(form.get('dealId')),file=form.get('file');
 if(!dealId||!(file instanceof File))return json({error:'Documento inválido.'},400);
 if(file.size>4*1024*1024)return json({error:'O arquivo deve ter no máximo 4 MB.'},400);
 const deal=await env.DB.prepare('SELECT id,client_id,operation_id FROM deals WHERE id=? AND owner_id=?').bind(dealId,user.userId).first<any>();
 if(!deal)return json({error:'Atendimento não encontrado.'},404);
 const now=Date.now(),type=String(form.get('documentType')||'identidade'),key=`deals/${user.userId}/${dealId}/${now}-${safe(file.name)}`;
 await env.FILES.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||'application/octet-stream'}});
 const row=await env.DB.prepare('INSERT INTO deal_documents (owner_id,deal_id,file_key,file_name,mime_type,size_bytes,document_type,created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id,file_name as fileName,mime_type as mimeType,size_bytes as sizeBytes,document_type as documentType,created_at as createdAt').bind(user.userId,dealId,key,file.name,file.type||'application/octet-stream',file.size,type,now).first<any>();
 if(deal.client_id)await env.DB.prepare('INSERT INTO client_documents (owner_id,client_id,file_key,file_name,mime_type,size_bytes,document_type,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(user.userId,deal.client_id,key,file.name,file.type||'application/octet-stream',file.size,type,now).run();
 await env.DB.prepare("INSERT INTO deal_history (owner_id,deal_id,operation_id,event_type,description,after_json,source,created_at) VALUES (?,?,?,?,?,?, 'Gestão TF',?)").bind(user.userId,dealId,deal.operation_id||null,'documento_anexado',`Documento anexado: ${file.name}`,JSON.stringify({documentId:row?.id,fileName:file.name,documentType:type}),now).run();
 return json({document:row},201);
}
