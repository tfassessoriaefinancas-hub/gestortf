import { env } from '@/lib/runtime';
import { getChatGPTUser } from '../../../chatgpt-auth';
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'Não autorizado'},{status:401});const rows=await env.DB.prepare('SELECT id,actor_role as actorRole,whatsapp_phone as whatsappPhone,command_text as commandText,action,client_id as clientId,operation_id as operationId,deal_id as dealId,created_at as createdAt FROM gestor_tf_audit WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').bind(user.userId).all();return Response.json({logs:rows.results});}
