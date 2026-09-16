import { env } from '@/lib/runtime';

export type GestorCommand = {
  action: 'create'|'move'|'update'|'note'|'query_client'|'list_stage'|'delete'|'confirm'|'cancel'|'unknown';
  targetName: string|null;
  cpf: string|null;
  product: string|null;
  stage: string|null;
  note: string|null;
  data: {
    birthDate:string|null; plate:string|null; vehicle:string|null; model:string|null;
    year:number|null; vehicleValue:number|null; financedValue:number|null;
    downPayment:number|null; desiredCredit:number|null; bank:string|null;
    term:number|null; installment:number|null; commission:number|null;
  };
};

type DealRow={id:number;client_id:number|null;operation_id:number|null;title:string;payload_json:string|null;stage:string;status:string;needs_completion:number;updated_at:number;name?:string;cpf?:string;birth_date?:string|null};
type Context={ownerId:string;fromPhone:string;messageId:string;commandText:string};

const stageLabels:Record<string,string>={
  atendimento:'PRIMEIRO ATENDIMENTO', analise:'EM ANÁLISE / ANALISANDO', indecisao:'INDECISÃO',
  fechamento:'EM FECHAMENTO', assinatura:'EM ASSINATURA', contratado:'CONTRATADO', finalizado:'FINALIZADO'
};
const blankData=():GestorCommand['data']=>({birthDate:null,plate:null,vehicle:null,model:null,year:null,vehicleValue:null,financedValue:null,downPayment:null,desiredCredit:null,bank:null,term:null,installment:null,commission:null});
const cleanCpf=(v?:string|null)=>String(v||'').replace(/\D/g,'');
const cleanPhone=(v?:string|null)=>String(v||'').replace(/\D/g,'');
const normalized=(v?:string|null)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const cents=(v:number|null|undefined)=>Number.isFinite(v as number)?Math.round(Number(v)*100):0;
const brl=(v:number|null|undefined)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((v||0)/100);
const json=(v:unknown)=>JSON.stringify(v);
const parseJson=<T>(v:string|null|undefined,fallback:T):T=>{try{return v?JSON.parse(v) as T:fallback}catch{return fallback}};

export function normalizeStage(value?:string|null){
  const s=normalized(value);
  if(/finaliz/.test(s))return 'finalizado';
  if(/contratad/.test(s))return 'contratado';
  if(/assinatura|assinou|assinado/.test(s))return 'assinatura';
  if(/fechamento|fechar|negociacao/.test(s))return 'fechamento';
  if(/analis|analise|proposta/.test(s))return 'analise';
  if(/indecis/.test(s))return 'indecisao';
  if(/atendimento|entrada|lead/.test(s))return 'atendimento';
  return null;
}

export async function interpretCommand(text:string):Promise<GestorCommand>{
  const simple=normalized(text);
  if(/^(confirmar|confirmo|sim|pode excluir)$/.test(simple))return {action:'confirm',targetName:null,cpf:null,product:null,stage:null,note:null,data:blankData()};
  if(/^(cancelar|cancela|nao|não)$/.test(simple))return {action:'cancel',targetName:null,cpf:null,product:null,stage:null,note:null,data:blankData()};
  if(env.OPENAI_API_KEY){
    const schema={type:'object',additionalProperties:false,required:['action','targetName','cpf','product','stage','note','data'],properties:{
      action:{type:'string',enum:['create','move','update','note','query_client','list_stage','delete','confirm','cancel','unknown']},
      targetName:{type:['string','null']},cpf:{type:['string','null']},product:{type:['string','null']},stage:{type:['string','null']},note:{type:['string','null']},
      data:{type:'object',additionalProperties:false,required:['birthDate','plate','vehicle','model','year','vehicleValue','financedValue','downPayment','desiredCredit','bank','term','installment','commission'],properties:{
        birthDate:{type:['string','null']},plate:{type:['string','null']},vehicle:{type:['string','null']},model:{type:['string','null']},year:{type:['number','null']},vehicleValue:{type:['number','null']},financedValue:{type:['number','null']},downPayment:{type:['number','null']},desiredCredit:{type:['number','null']},bank:{type:['string','null']},term:{type:['number','null']},installment:{type:['number','null']},commission:{type:['number','null']}
      }}
    }};
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:json({
      model:env.OPENAI_COMMAND_MODEL||'gpt-4.1-mini',temperature:0,input:[
        {role:'system',content:`Você interpreta comandos administrativos do CRM Gestão TF em português brasileiro. Extraia apenas fatos presentes. Datas em YYYY-MM-DD; valores monetários como número em reais. "aprovado no Banco" atualiza banco. "assinou" move para assinatura; "foi contratado" para contratado; "finaliza" para finalizado. Consultas por etapa usam list_stage. Correções usam update. Observações usam note. Não invente CPF, nome, produto ou valores.`},
        {role:'user',content:text}
      ],text:{format:{type:'json_schema',name:'gestor_tf_command',strict:true,schema}}})});
    if(response.ok){
      const body=await response.json() as any;
      const output=body.output_text||body.output?.flatMap((o:any)=>o.content||[]).find((c:any)=>c.type==='output_text')?.text;
      if(output){const parsed=parseJson<GestorCommand>(output,null as any);if(parsed){parsed.stage=normalizeStage(parsed.stage)||parsed.stage;parsed.cpf=cleanCpf(parsed.cpf);return parsed;}}
    }
  }
  return fallbackCommand(text);
}

function fallbackCommand(text:string):GestorCommand{
  const s=normalized(text),data=blankData(),cpf=cleanCpf(text.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/)?.[0]);
  const stage=normalizeStage(text);
  const name=text.match(/(?:cliente|atendimento (?:do|da)|move (?:o|a)?|coloca (?:o|a)?|passa (?:o|a)?|finaliza (?:o|a)?|excluir (?:o atendimento (?:do|da)?|(?:o|a)?))\s*([\p{L} ]{2,50}?)(?=\.|,|\s+para\s+|\s+esta\s+|\s+está\s+|\s+cpf\b|$)/iu)?.[1]?.trim()||null;
  const labels=(key:string)=>new RegExp(`${key}\\s*[:]?\\s*([^\\n,.]+)`,'i');
  data.birthDate=text.match(/(?:nascimento|nascido em|data de nascimento)\s*[:]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1]||null;
  data.plate=text.match(/placa\s*[:]?\s*([A-Z]{3}[0-9][A-Z0-9][0-9]{2})/i)?.[1]?.toUpperCase()||null;
  data.bank=text.match(labels('banco'))?.[1]?.trim()||null;
  if(/exclu/.test(s))return {action:'delete',targetName:name,cpf,product:null,stage:null,note:null,data};
  if(/mostra|consulta|resumo/.test(s))return {action:'query_client',targetName:name,cpf,product:null,stage:null,note:null,data};
  if(/quais clientes|quem esta|quem está/.test(s)&&stage)return {action:'list_stage',targetName:null,cpf:null,product:null,stage,note:null,data};
  if(/observa|anota|acrescenta/.test(s))return {action:'note',targetName:name,cpf,product:null,stage:null,note:text.split(':').slice(1).join(':').trim()||text,data};
  if(/inicia|novo atendimento|cria/.test(s))return {action:'create',targetName:name,cpf,product:text.match(/(?:produto|para)\s*[:]?\s*(cons[oó]rcio|financiamento(?: de ve[ií]culo)?|fgts|seguro|inss|consignado)/i)?.[1]||null,stage:'atendimento',note:null,data};
  if(stage)return {action:'move',targetName:name,cpf,product:null,stage,note:null,data};
  if(/corrig|adicion|acrescent/.test(s))return {action:'update',targetName:name,cpf,product:null,stage:null,note:null,data};
  return {action:'unknown',targetName:name,cpf,product:null,stage:null,note:null,data};
}

async function addHistory(ctx:Context,dealId:number,operationId:number|null,type:string,description:string,before:unknown,after:unknown){
  await env.DB.prepare('INSERT INTO deal_history (owner_id,deal_id,operation_id,event_type,description,before_json,after_json,source,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(ctx.ownerId,dealId,operationId,type,description,before?json(before):null,after?json(after):null,'WhatsApp / Gestor TF',Date.now()).run();
}
async function addAudit(ctx:Context,action:string,ids:{clientId?:number|null;operationId?:number|null;dealId?:number|null},before:unknown,after:unknown){
  await env.DB.prepare('INSERT INTO gestor_tf_audit (owner_id,actor_role,whatsapp_phone,message_id,command_text,action,client_id,operation_id,deal_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(ctx.ownerId,'ADMINISTRADOR',ctx.fromPhone,ctx.messageId,ctx.commandText,action,ids.clientId||null,ids.operationId||null,ids.dealId||null,before?json(before):null,after?json(after):null,Date.now()).run();
}

function payloadOf(deal:DealRow){return parseJson<Record<string,any>>(deal.payload_json||deal.title,{});}

async function findDeals(ownerId:string,command:GestorCommand):Promise<DealRow[]>{
  const cpf=cleanCpf(command.cpf),target=normalized(command.targetName),rows=await env.DB.prepare(`SELECT d.id,d.client_id,d.operation_id,d.title,d.payload_json,d.stage,d.status,d.needs_completion,d.updated_at,c.name,c.cpf,c.birth_date FROM deals d LEFT JOIN clients c ON c.id=d.client_id AND c.owner_id=d.owner_id WHERE d.owner_id=? AND d.stage!='cancelado' ORDER BY d.updated_at DESC LIMIT 100`).bind(ownerId).all<DealRow>();
  return rows.results.filter(row=>{
    const p=payloadOf(row),rowCpf=cleanCpf(row.cpf||p.cpf),rowName=normalized(row.name||p.name);
    if(cpf)return rowCpf===cpf;
    if(!target)return false;
    return rowName===target||rowName.includes(target)||target.includes(rowName);
  }).filter(row=>!command.product||normalized(String(payloadOf(row).product||'')).includes(normalized(command.product)));
}

async function requestChoice(ctx:Context,command:GestorCommand,candidates:DealRow[]){
  const selected=candidates.slice(0,8),now=Date.now();
  await env.DB.prepare("UPDATE whatsapp_pending_actions SET status='expirado' WHERE owner_id=? AND from_phone=? AND status='pendente'").bind(ctx.ownerId,ctx.fromPhone).run();
  await env.DB.prepare('INSERT INTO whatsapp_pending_actions (owner_id,from_phone,kind,payload_json,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').bind(ctx.ownerId,ctx.fromPhone,'escolher_cliente',json({command,candidateIds:selected.map(x=>x.id)}),'pendente',now,now+10*60_000).run();
  return `Encontrei mais de um atendimento. Qual deles?\n\n${selected.map((x,i)=>`${i+1}. ${x.name||payloadOf(x).name} – CPF final ${cleanCpf(x.cpf||payloadOf(x).cpf).slice(-4)} – ${payloadOf(x).product||'Operação'}`).join('\n')}\n\nResponda apenas com o número.`;
}

async function getPending(ctx:Context){return env.DB.prepare("SELECT * FROM whatsapp_pending_actions WHERE owner_id=? AND from_phone=? AND status='pendente' AND expires_at>? ORDER BY id DESC LIMIT 1").bind(ctx.ownerId,ctx.fromPhone,Date.now()).first<any>();}

export async function executeCommand(ctx:Context,command:GestorCommand):Promise<string>{
  const pending=await getPending(ctx);
  if(pending){
    const p=parseJson<any>(pending.payload_json,{});
    if(command.action==='cancel'){await env.DB.prepare("UPDATE whatsapp_pending_actions SET status='cancelado' WHERE id=?").bind(pending.id).run();return 'Ação cancelada.';}
    if(pending.kind==='confirmar_exclusao'&&command.action==='confirm'){
      await env.DB.prepare("UPDATE whatsapp_pending_actions SET status='confirmado' WHERE id=?").bind(pending.id).run();
      return deleteDeal(ctx,Number(p.dealId));
    }
    if(pending.kind==='escolher_cliente'){
      const choice=Number(ctx.commandText.trim()),dealId=Array.isArray(p.candidateIds)?Number(p.candidateIds[choice-1]):0;
      if(dealId){await env.DB.prepare("UPDATE whatsapp_pending_actions SET status='confirmado' WHERE id=?").bind(pending.id).run();return executeResolved(ctx,p.command,dealId);}
      return 'Responda com o número de uma das opções ou envie CANCELAR.';
    }
  }
  if(command.action==='confirm'||command.action==='cancel')return 'Não há nenhuma ação pendente para confirmar.';
  if(command.action==='create')return createDeal(ctx,command);
  if(command.action==='list_stage')return listStage(ctx,command);
  const candidates=await findDeals(ctx.ownerId,command);
  if(!candidates.length)return 'Não encontrei esse atendimento. Informe o CPF completo ou o nome do cliente.';
  if(candidates.length>1)return requestChoice(ctx,command,candidates);
  return executeResolved(ctx,command,candidates[0].id);
}

async function createDeal(ctx:Context,command:GestorCommand){
  const cpf=cleanCpf(command.cpf),name=String(command.targetName||'').trim(),product=String(command.product||'').trim();
  if(!name||cpf.length!==11||!command.data.birthDate||!product)return 'Para iniciar, informe nome completo, CPF, data de nascimento e produto.';
  const now=Date.now(),birth=normalizeDate(command.data.birthDate);
  let client=await env.DB.prepare('SELECT id,name,cpf FROM clients WHERE owner_id=? AND cpf=? AND deleted_at IS NULL').bind(ctx.ownerId,cpf).first<any>();
  if(!client){client=await env.DB.prepare('INSERT INTO clients (owner_id,name,normalized_name,cpf,birth_date,notes,source_row,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id,name,cpf').bind(ctx.ownerId,name,normalized(name),cpf,birth,'Criado pelo Gestor TF','WhatsApp / Gestor TF',now,now).first<any>();}
  else await env.DB.prepare('UPDATE clients SET name=COALESCE(NULLIF(name,\'\'),?),birth_date=COALESCE(birth_date,?),updated_at=? WHERE id=? AND owner_id=?').bind(name,birth,now,client.id,ctx.ownerId).run();
  const active=await env.DB.prepare("SELECT id,operation_id,title,payload_json,stage FROM deals WHERE owner_id=? AND client_id=? AND stage!='cancelado' AND status NOT IN ('concluido','excluido') ORDER BY updated_at DESC").bind(ctx.ownerId,client.id).all<DealRow>();
  const same=active.results.find(d=>normalized(payloadOf(d).product)===normalized(product));
  if(same){await updatePayload(ctx,same.id,command);return `✅ Atendimento atualizado.\n\nCliente: ${name}\nProduto: ${product}\nEtapa: ${stageLabels[same.stage]||same.stage}`;}
  const d=command.data,operation=await env.DB.prepare(`INSERT INTO operations (owner_id,client_id,bank,original_product,category,producer,origin,value_cents,installment_cents,term,operation_date,status,notes,vehicle_plate,vehicle_name,vehicle_model,vehicle_year,vehicle_value_cents,financed_value_cents,down_payment_cents,desired_credit_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(ctx.ownerId,client.id,d.bank||null,product,product,'Thiago','WhatsApp / Gestor TF',cents(d.financedValue||d.desiredCredit),cents(d.installment),d.term||null,new Date().toISOString().slice(0,10),'em_atendimento',command.note||null,d.plate||null,d.vehicle||null,d.model||null,d.year||null,cents(d.vehicleValue),cents(d.financedValue),cents(d.downPayment),cents(d.desiredCredit),now,now).first<{id:number}>();
  if(!operation)throw new Error('Falha ao criar operação');
  const payload={name,cpf,product,...d,birthDate:birth};
  const deal=await env.DB.prepare("INSERT INTO deals (owner_id,client_id,operation_id,title,payload_json,value_cents,stage,status,updated_at,created_at,needs_completion,source,probability) VALUES (?,?,?,?,?,?,'atendimento','aberto',?,?,0,'WhatsApp / Gestor TF',0) RETURNING id").bind(ctx.ownerId,client.id,operation.id,json(payload),json(payload),cents(d.financedValue||d.desiredCredit),now,now).first<{id:number}>();
  if(!deal)throw new Error('Falha ao criar atendimento');
  await addHistory(ctx,deal.id,operation.id,'criacao','Atendimento criado via WhatsApp.',null,{stage:'atendimento',payload});
  await addAudit(ctx,'ATENDIMENTO_CRIADO',{clientId:client.id,operationId:operation.id,dealId:deal.id},null,{stage:'atendimento',payload});
  const extra=d.vehicle?`\nVeículo: ${d.vehicle}${d.year?` ${d.year}`:''}`:'';
  const amount=d.financedValue?`\nFinanciamento solicitado: ${brl(cents(d.financedValue))}`:d.desiredCredit?`\nCarta desejada: ${brl(cents(d.desiredCredit))}`:'';
  return `✅ Atendimento criado.\n\nCliente: ${name}\nProduto: ${product}${extra}${amount}\nEtapa: ${stageLabels.atendimento}`;
}

async function executeResolved(ctx:Context,command:GestorCommand,dealId:number){
  if(command.action==='move')return moveDeal(ctx,dealId,command.stage);
  if(command.action==='update')return updatePayload(ctx,dealId,command);
  if(command.action==='note')return addNote(ctx,dealId,command.note||ctx.commandText);
  if(command.action==='query_client')return summarizeDeal(ctx,dealId);
  if(command.action==='delete'){
    const d=await getDeal(ctx.ownerId,dealId),p=d?payloadOf(d):{};if(!d)return 'Atendimento não encontrado.';
    const now=Date.now();await env.DB.prepare("UPDATE whatsapp_pending_actions SET status='expirado' WHERE owner_id=? AND from_phone=? AND status='pendente'").bind(ctx.ownerId,ctx.fromPhone).run();
    await env.DB.prepare('INSERT INTO whatsapp_pending_actions (owner_id,from_phone,kind,payload_json,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').bind(ctx.ownerId,ctx.fromPhone,'confirmar_exclusao',json({dealId}),'pendente',now,now+5*60_000).run();
    return `Confirma a exclusão do atendimento de ${d.name||p.name}?\n\nResponda CONFIRMAR ou CANCELAR.`;
  }
  return 'Não entendi a ação desejada.';
}

async function getDeal(ownerId:string,id:number){return env.DB.prepare('SELECT d.*,c.name,c.cpf,c.birth_date FROM deals d LEFT JOIN clients c ON c.id=d.client_id WHERE d.id=? AND d.owner_id=?').bind(id,ownerId).first<DealRow>();}

async function moveDeal(ctx:Context,dealId:number,stageValue:string|null){
  const stage=normalizeStage(stageValue);if(!stage)return 'Não reconheci a etapa do Kanban.';
  const deal=await getDeal(ctx.ownerId,dealId);if(!deal)return 'Atendimento não encontrado.';
  const before={stage:deal.stage,status:deal.status},final=stage==='finalizado',now=Date.now();
  await env.DB.prepare('UPDATE deals SET stage=?,status=?,needs_completion=?,updated_at=? WHERE id=? AND owner_id=?').bind(stage,final?'aguardando_cadastro':'aberto',final?1:0,now,dealId,ctx.ownerId).run();
  if(deal.operation_id)await env.DB.prepare('UPDATE operations SET status=?,updated_at=? WHERE id=? AND owner_id=?').bind(final?'aguardando_cadastro':stage,now,deal.operation_id,ctx.ownerId).run();
  const after={stage,status:final?'aguardando_cadastro':'aberto',needsCompletion:final};
  await addHistory(ctx,dealId,deal.operation_id,'mudanca_etapa',`Etapa alterada de ${stageLabels[deal.stage]||deal.stage} para ${stageLabels[stage]}.`,before,after);
  await addAudit(ctx,'ETAPA_ALTERADA',{clientId:deal.client_id,operationId:deal.operation_id,dealId},before,after);
  const p=payloadOf(deal),alert=final?'\n⚠️ O cartão está aguardando FINALIZAR CADASTRO no Gestão TF.':'';
  return `✅ ${deal.name||p.name} foi movido para ${stageLabels[stage]}.${alert}`;
}

async function updatePayload(ctx:Context,dealId:number,command:GestorCommand){
  const deal=await getDeal(ctx.ownerId,dealId);if(!deal)return 'Atendimento não encontrado.';
  const before=payloadOf(deal),d=command.data,updates:Record<string,unknown>={};
  for(const [key,value] of Object.entries(d))if(value!==null&&value!=='')updates[key]=value;
  if(command.product)updates.product=command.product;if(command.cpf)updates.cpf=cleanCpf(command.cpf);if(command.targetName)updates.name=command.targetName;
  const after={...before,...updates},now=Date.now();
  await env.DB.prepare('UPDATE deals SET title=?,payload_json=?,value_cents=?,updated_at=? WHERE id=? AND owner_id=?').bind(json(after),json(after),cents(after.financedValue||after.desiredCredit),now,dealId,ctx.ownerId).run();
  if(deal.client_id){
    if(updates.name)await env.DB.prepare('UPDATE clients SET name=?,normalized_name=?,updated_at=? WHERE id=? AND owner_id=?').bind(String(updates.name),normalized(String(updates.name)),now,deal.client_id,ctx.ownerId).run();
    if(updates.birthDate)await env.DB.prepare('UPDATE clients SET birth_date=?,updated_at=? WHERE id=? AND owner_id=?').bind(normalizeDate(String(updates.birthDate)),now,deal.client_id,ctx.ownerId).run();
  }
  if(deal.operation_id)await env.DB.prepare(`UPDATE operations SET bank=COALESCE(?,bank),original_product=COALESCE(?,original_product),value_cents=CASE WHEN ?>0 THEN ? ELSE value_cents END,installment_cents=CASE WHEN ?>0 THEN ? ELSE installment_cents END,term=COALESCE(?,term),vehicle_plate=COALESCE(?,vehicle_plate),vehicle_name=COALESCE(?,vehicle_name),vehicle_model=COALESCE(?,vehicle_model),vehicle_year=COALESCE(?,vehicle_year),vehicle_value_cents=CASE WHEN ?>0 THEN ? ELSE vehicle_value_cents END,financed_value_cents=CASE WHEN ?>0 THEN ? ELSE financed_value_cents END,down_payment_cents=CASE WHEN ?>0 THEN ? ELSE down_payment_cents END,desired_credit_cents=CASE WHEN ?>0 THEN ? ELSE desired_credit_cents END,updated_at=? WHERE id=? AND owner_id=?`).bind(d.bank||null,command.product||null,cents(d.financedValue||d.desiredCredit),cents(d.financedValue||d.desiredCredit),cents(d.installment),cents(d.installment),d.term||null,d.plate||null,d.vehicle||null,d.model||null,d.year||null,cents(d.vehicleValue),cents(d.vehicleValue),cents(d.financedValue),cents(d.financedValue),cents(d.downPayment),cents(d.downPayment),cents(d.desiredCredit),cents(d.desiredCredit),now,deal.operation_id,ctx.ownerId).run();
  const changed=Object.entries(updates).map(([k,v])=>`${fieldLabel(k)}: ${formatValue(k,v)}`).join('; ');
  await addHistory(ctx,dealId,deal.operation_id,'atualizacao',changed||'Dados do atendimento atualizados.',before,after);
  await addAudit(ctx,'DADOS_ATUALIZADOS',{clientId:deal.client_id,operationId:deal.operation_id,dealId},before,after);
  return `✅ Atendimento de ${after.name||deal.name} atualizado.\n${changed||'Dados registrados.'}`;
}

async function addNote(ctx:Context,dealId:number,note:string){
  const deal=await getDeal(ctx.ownerId,dealId);if(!deal)return 'Atendimento não encontrado.';const clean=note.trim();
  if(deal.operation_id)await env.DB.prepare("UPDATE operations SET notes=CASE WHEN notes IS NULL OR notes='' THEN ? ELSE notes || char(10) || ? END,updated_at=? WHERE id=? AND owner_id=?").bind(clean,clean,Date.now(),deal.operation_id,ctx.ownerId).run();
  await addHistory(ctx,dealId,deal.operation_id,'observacao',clean,null,{note:clean});
  await addAudit(ctx,'OBSERVACAO_ADICIONADA',{clientId:deal.client_id,operationId:deal.operation_id,dealId},null,{note:clean});
  const p=payloadOf(deal);return `✅ Observação adicionada ao atendimento de ${deal.name||p.name}.`;
}

async function summarizeDeal(ctx:Context,dealId:number){
  const row=await env.DB.prepare(`SELECT d.*,c.name,c.cpf,c.birth_date,o.original_product,o.bank,o.vehicle_name,o.vehicle_model,o.vehicle_year,o.vehicle_value_cents,o.financed_value_cents,o.desired_credit_cents FROM deals d LEFT JOIN clients c ON c.id=d.client_id LEFT JOIN operations o ON o.id=d.operation_id WHERE d.id=? AND d.owner_id=?`).bind(dealId,ctx.ownerId).first<any>();
  if(!row)return 'Atendimento não encontrado.';const p=parseJson<any>(row.payload_json||row.title,{}),cpf=cleanCpf(row.cpf||p.cpf),amount=row.financed_value_cents||row.desired_credit_cents||0;
  return [`Cliente: ${row.name||p.name}`,`CPF: ***.***.***-${cpf.slice(-2)}`,`Produto: ${row.original_product||p.product||'Não informado'}`,row.vehicle_name?`Veículo: ${row.vehicle_name}${row.vehicle_model?` ${row.vehicle_model}`:''}${row.vehicle_year?` ${row.vehicle_year}`:''}`:null,row.vehicle_value_cents?`Valor do veículo: ${brl(row.vehicle_value_cents)}`:null,amount?`Valor da operação: ${brl(amount)}`:null,row.bank?`Banco: ${row.bank}`:null,`Etapa atual: ${stageLabels[row.stage]||row.stage}`,`Última movimentação: ${new Date(row.updated_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})}`].filter(Boolean).join('\n');
}

async function listStage(ctx:Context,command:GestorCommand){
  const stage=normalizeStage(command.stage);if(!stage)return 'Não reconheci a etapa.';
  const rows=await env.DB.prepare(`SELECT d.id,d.title,d.payload_json,c.name,c.cpf FROM deals d LEFT JOIN clients c ON c.id=d.client_id WHERE d.owner_id=? AND d.stage=? AND d.status!='excluido' ORDER BY d.updated_at DESC LIMIT 25`).bind(ctx.ownerId,stage).all<any>();
  if(!rows.results.length)return `Não há clientes em ${stageLabels[stage]}.`;
  return `${stageLabels[stage]} (${rows.results.length})\n\n${rows.results.map((r:any,i:number)=>{const p=parseJson<any>(r.payload_json||r.title,{});return `${i+1}. ${r.name||p.name} – ${p.product||'Operação'} – CPF final ${cleanCpf(r.cpf||p.cpf).slice(-4)}`}).join('\n')}`;
}

async function deleteDeal(ctx:Context,dealId:number){
  const deal=await getDeal(ctx.ownerId,dealId);if(!deal)return 'Atendimento não encontrado.';const p=payloadOf(deal),before={stage:deal.stage,status:deal.status};
  await env.DB.prepare("UPDATE deals SET stage='cancelado',status='excluido',updated_at=? WHERE id=? AND owner_id=?").bind(Date.now(),dealId,ctx.ownerId).run();
  if(deal.operation_id)await env.DB.prepare("UPDATE operations SET status='cancelado',deleted_at=?,updated_at=? WHERE id=? AND owner_id=?").bind(Date.now(),Date.now(),deal.operation_id,ctx.ownerId).run();
  await addHistory(ctx,dealId,deal.operation_id,'exclusao','Atendimento excluído após confirmação pelo administrador.',before,{stage:'cancelado',status:'excluido'});
  await addAudit(ctx,'ATENDIMENTO_EXCLUIDO',{clientId:deal.client_id,operationId:deal.operation_id,dealId},before,{stage:'cancelado',status:'excluido'});
  return `✅ Atendimento de ${deal.name||p.name} excluído.`;
}

function normalizeDate(v:string){const m=v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);if(!m)return v;const year=m[3].length===2?`19${m[3]}`:m[3];return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
function fieldLabel(k:string){return ({bank:'Banco',term:'Prazo',installment:'Parcela',plate:'Placa',vehicle:'Veículo',model:'Modelo',year:'Ano',vehicleValue:'Valor do veículo',financedValue:'Valor financiado',downPayment:'Entrada',desiredCredit:'Carta desejada',commission:'Comissão',birthDate:'Nascimento',product:'Produto',cpf:'CPF',name:'Nome'} as Record<string,string>)[k]||k;}
function formatValue(k:string,v:unknown){if(['vehicleValue','financedValue','downPayment','desiredCredit','installment','commission'].includes(k))return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));if(k==='term')return `${v} meses`;return String(v);}

export { cleanPhone, stageLabels };
