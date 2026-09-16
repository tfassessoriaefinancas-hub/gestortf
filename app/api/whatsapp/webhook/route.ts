import { env } from '@/lib/runtime';
import { cleanPhone, executeCommand, interpretCommand } from '../../../../lib/gestor-tf';

const json=(data:unknown,status=200)=>Response.json(data,{status});

export async function GET(request:Request){
  const url=new URL(request.url),mode=url.searchParams.get('hub.mode'),token=url.searchParams.get('hub.verify_token'),challenge=url.searchParams.get('hub.challenge');
  if(mode==='subscribe'&&env.WHATSAPP_VERIFY_TOKEN&&token===env.WHATSAPP_VERIFY_TOKEN)return new Response(challenge||'',{status:200});
  return new Response('Verificação recusada.',{status:403});
}

export async function POST(request:Request){
  const raw=await request.text();
  if(!env.WHATSAPP_APP_SECRET||!(await validSignature(raw,request.headers.get('x-hub-signature-256'))))return json({error:'Assinatura inválida.'},401);
  let body:any;try{body=JSON.parse(raw)}catch{return json({error:'JSON inválido.'},400)}
  const changes=body?.entry?.flatMap((entry:any)=>entry.changes||[])||[];
  for(const change of changes){
    const value=change?.value,phoneNumberId=String(value?.metadata?.phone_number_id||'');
    const integration=await env.DB.prepare('SELECT owner_id,admin_phone,enabled FROM whatsapp_integrations WHERE phone_number_id=?').bind(phoneNumberId).first<any>();
    for(const message of value?.messages||[]){
      const id=String(message.id||''),from=cleanPhone(message.from),type=String(message.type||'unknown'),received=Date.now();
      if(!id)continue;
      const inserted=await env.DB.prepare("INSERT INTO whatsapp_messages (message_id,owner_id,from_phone,message_type,status,received_at) VALUES (?,?,?,?,?,?) ON CONFLICT(message_id) DO NOTHING").bind(id,integration?.owner_id||null,from,type,'recebida',received).run();
      if(!inserted.meta.changes)continue;
      if(!integration||!integration.enabled||cleanPhone(integration.admin_phone)!==from){
        await env.DB.prepare("UPDATE whatsapp_messages SET status='nao_autorizada',processed_at=? WHERE message_id=?").bind(Date.now(),id).run();
        if(integration&&env.WHATSAPP_ACCESS_TOKEN)await sendWhatsapp(phoneNumberId,from,'Mensagem recebida. Um consultor da TF dará continuidade ao seu atendimento.');
        continue;
      }
      try{
        const commandText=type==='text'?String(message.text?.body||''):type==='audio'?await transcribeAudio(String(message.audio?.id||''),String(message.audio?.mime_type||'audio/ogg')):'';
        if(!commandText){await sendWhatsapp(phoneNumberId,from,'Envie seu comando por texto ou áudio.');continue;}
        await env.DB.prepare("UPDATE whatsapp_messages SET command_text=?,status='processando' WHERE message_id=?").bind(commandText,id).run();
        const command=await interpretCommand(commandText),reply=await executeCommand({ownerId:integration.owner_id,fromPhone:from,messageId:id,commandText},command);
        await sendWhatsapp(phoneNumberId,from,reply);
        await env.DB.prepare("UPDATE whatsapp_messages SET status='concluida',processed_at=? WHERE message_id=?").bind(Date.now(),id).run();
      }catch(error){
        const detail=error instanceof Error?error.message:'Falha desconhecida';
        await env.DB.prepare("UPDATE whatsapp_messages SET status='erro',error_text=?,processed_at=? WHERE message_id=?").bind(detail.slice(0,1000),Date.now(),id).run();
        await sendWhatsapp(phoneNumberId,from,'Não consegui concluir esse comando. Tente novamente informando o nome completo ou CPF do cliente.').catch(()=>{});
      }
    }
  }
  return json({received:true});
}

async function validSignature(raw:string,header:string|null){
  if(!header?.startsWith('sha256='))return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WHATSAPP_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw));
  const expected='sha256='+[...new Uint8Array(signed)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(expected.length!==header.length)return false;let result=0;for(let i=0;i<expected.length;i++)result|=expected.charCodeAt(i)^header.charCodeAt(i);return result===0;
}

async function sendWhatsapp(phoneNumberId:string,to:string,text:string){
  if(!env.WHATSAPP_ACCESS_TOKEN)throw new Error('Token do WhatsApp não configurado');
  const version=env.WHATSAPP_GRAPH_VERSION||'v23.0';
  const response=await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`,{method:'POST',headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:false,body:text.slice(0,4096)}})});
  if(!response.ok)throw new Error(`Falha ao responder no WhatsApp (${response.status})`);
}

async function transcribeAudio(mediaId:string,mimeType:string){
  if(!mediaId||!env.WHATSAPP_ACCESS_TOKEN)throw new Error('Áudio do WhatsApp indisponível');
  if(!env.OPENAI_API_KEY)throw new Error('Transcrição de áudio não configurada');
  const version=env.WHATSAPP_GRAPH_VERSION||'v23.0',headers={authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`};
  const metadata=await fetch(`https://graph.facebook.com/${version}/${mediaId}`,{headers});
  if(!metadata.ok)throw new Error('Não foi possível localizar o áudio');
  const mediaUrl=String((await metadata.json() as any).url||''),media=await fetch(mediaUrl,{headers});
  if(!media.ok)throw new Error('Não foi possível baixar o áudio');
  const form=new FormData();form.append('model',env.OPENAI_TRANSCRIPTION_MODEL||'gpt-4o-mini-transcribe');form.append('language','pt');form.append('file',new File([await media.arrayBuffer()],'comando.ogg',{type:mimeType||'audio/ogg'}));
  const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form});
  if(!response.ok)throw new Error('Não foi possível transcrever o áudio');
  return String((await response.json() as any).text||'').trim();
}
