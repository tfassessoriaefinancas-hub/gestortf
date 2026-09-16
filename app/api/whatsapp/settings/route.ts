import { env } from '@/lib/runtime';
import { getChatGPTUser } from '../../../chatgpt-auth';

const clean=(v:unknown)=>String(v||'').replace(/\D/g,'');
const json=(data:unknown,status=200)=>Response.json(data,{status});

export async function GET(request:Request){
  const user=await getChatGPTUser();if(!user)return json({error:'Não autorizado'},401);
  const row=await env.DB.prepare('SELECT admin_phone as adminPhone,phone_number_id as phoneNumberId,display_phone as displayPhone,enabled,updated_at as updatedAt FROM whatsapp_integrations WHERE owner_id=?').bind(user.userId).first<any>();
  return json({integration:row||null,webhookUrl:`${new URL(request.url).origin}/api/whatsapp/webhook`,services:{whatsapp:Boolean(env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_APP_SECRET&&env.WHATSAPP_VERIFY_TOKEN),ai:Boolean(env.OPENAI_API_KEY)}});
}

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return json({error:'Não autorizado'},401);
  const body=await request.json() as any,adminPhone=clean(body.adminPhone),phoneNumberId=clean(body.phoneNumberId),displayPhone=String(body.displayPhone||'').trim();
  if(adminPhone.length<10||adminPhone.length>15)return json({error:'Informe o número administrador com DDI e DDD.'},400);
  if(!phoneNumberId)return json({error:'Informe o ID do número do WhatsApp na Meta.'},400);
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO whatsapp_integrations (owner_id,admin_phone,phone_number_id,display_phone,enabled,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(owner_id) DO UPDATE SET admin_phone=excluded.admin_phone,phone_number_id=excluded.phone_number_id,display_phone=excluded.display_phone,enabled=1,updated_at=excluded.updated_at`).bind(user.userId,adminPhone,phoneNumberId,displayPhone||null,now,now).run();
  return json({ok:true,adminPhone,phoneNumberId,displayPhone});
}

export async function PATCH(request:Request){
  const user=await getChatGPTUser();if(!user)return json({error:'Não autorizado'},401);
  const body=await request.json() as any,enabled=body.enabled?1:0;
  await env.DB.prepare('UPDATE whatsapp_integrations SET enabled=?,updated_at=? WHERE owner_id=?').bind(enabled,Date.now(),user.userId).run();
  return json({ok:true,enabled:Boolean(enabled)});
}
