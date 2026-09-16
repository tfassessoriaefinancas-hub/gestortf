import { env } from '@/lib/runtime';
import { getChatGPTUser } from '../../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status});

export async function POST(request:Request){
  const user=await getChatGPTUser();
  if(!user)return json({error:'Não autorizado'},401);
  if(!env.OPENAI_API_KEY)return json({error:'A leitura inteligente ainda não está configurada.'},503);
  const form=await request.formData(),file=form.get('file');
  if(!(file instanceof File))return json({error:'Selecione uma CNH, RG ou documento com foto.'},400);
  if(file.size>4*1024*1024)return json({error:'O arquivo deve ter no máximo 4 MB.'},400);
  const allowed=['application/pdf','image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type))return json({error:'Envie um arquivo PDF, JPG, PNG ou WEBP.'},400);

  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary='';
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  const dataUrl=`data:${file.type};base64,${btoa(binary)}`;
  const documentPart=file.type==='application/pdf'
    ? {type:'input_file',filename:file.name,file_data:dataUrl}
    : {type:'input_image',image_url:dataUrl,detail:'high'};
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},
    body:JSON.stringify({
      model:env.OPENAI_DOCUMENT_MODEL||'gpt-4.1-mini',
      store:false,
      input:[{role:'user',content:[
        {type:'input_text',text:'Leia este documento brasileiro. Extraia somente: nome completo do titular, CPF com 11 dígitos e data de nascimento no formato YYYY-MM-DD. Não invente dados; use string vazia quando não estiver legível.'},
        documentPart,
      ]}],
      text:{format:{type:'json_schema',name:'documento_cliente',strict:true,schema:{type:'object',additionalProperties:false,properties:{name:{type:'string'},cpf:{type:'string'},birthDate:{type:'string'},confidence:{type:'string',enum:['alta','media','baixa']}},required:['name','cpf','birthDate','confidence']}}},
      max_output_tokens:300,
    }),
  });
  const result=await response.json() as any;
  if(!response.ok)return json({error:'Não consegui ler o documento agora. Tente novamente com uma foto mais nítida.'},502);
  const text=result.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==='output_text')?.text;
  try{
    const fields=JSON.parse(text||'{}');
    fields.cpf=String(fields.cpf||'').replace(/\D/g,'').slice(0,11);
    return json({fields});
  }catch{return json({error:'Não foi possível identificar os dados. Confira a imagem e tente novamente.'},422)}
}
