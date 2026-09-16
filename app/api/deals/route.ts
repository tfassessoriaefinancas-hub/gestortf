import { env } from '@/lib/runtime';
import { readOperations } from '@/lib/operations';
import { updateClientRecord, updateOperationRecord, RecordUpdateError } from '@/lib/update-operation';
import { toCents } from '@/lib/money';
import { getTfAccess, hasTfPermission, type TfAccess } from '../../chatgpt-auth';

const cleanCpf=(v:string)=>v.replace(/\D/g,'');
const norm=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const moneyBr=toCents;
const isoDate=(v:unknown)=>{const s=String(v||'').trim(),m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:s;};
const phoneBr=(v:unknown)=>{let d=String(v||'').replace(/\D/g,'');if(d.startsWith('55')&&d.length>11)d=d.slice(2);d=d.slice(0,11);if(d.length===11)return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;if(d.length===10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return String(v||'').trim();};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache'}});
const parse=(v:unknown)=>{try{return JSON.parse(String(v||'{}'))}catch{return {name:String(v||''),cpf:'',birthDate:'',product:''}}};

export async function GET(){
 const user=await getTfAccess();if(!user||!hasTfPermission(user,'atendimento'))return json({error:'Não autorizado'},401);
 await reconcileImportedCompletions(user);
 const employeeClause=user.role==='employee'?' AND d.assigned_user_id=?':'';
 const statement=env.DB.prepare(`SELECT d.id,d.title,d.payload_json,d.stage,d.status,d.needs_completion,d.created_at,d.updated_at,d.client_id,d.operation_id,d.source,d.assigned_user_id,a.name assigned_name FROM deals d LEFT JOIN access_users a ON a.id=d.assigned_user_id WHERE d.owner_id IN (?,?) AND d.stage!='cancelado' AND d.status!='excluido'${employeeClause} ORDER BY d.updated_at DESC`);
 const rows=await (user.role==='employee'?statement.bind(user.ownerKeys[0],user.ownerKeys[1],user.memberId):statement.bind(user.ownerKeys[0],user.ownerKeys[1])).all();
 const operationIds=Array.from(new Set(rows.results.map(row=>Number(row.operation_id)).filter(Boolean)));
 const operations=new Map((await readOperations(env.DB,user,{ids:operationIds,includeIncomplete:true})).map(operation=>[operation.dbId,operation]));
 return json({deals:rows.results.map((r:any)=>{
  const base=parse(r.payload_json||r.title),operation=operations.get(Number(r.operation_id));
  const canonical=operation?{name:operation.clientName,cpf:operation.clientCpf,birthDate:operation.clientBirthDate,phone:operation.clientPhone,benefit:operation.clientBenefit,
   product:operation.product,bank:operation.bank,producer:operation.producer,origin:operation.origin,promoter:operation.promoter,operationType:operation.operationType,
   agreement:operation.agreement,contractType:operation.contractType,dueDay:operation.dueDay,productionIndicator:operation.productionIndicator,
   value:operation.value,installment:operation.installment,term:String(operation.term||''),commissionRate:String(operation.commissionRate),commissionCustomRate:'',commissionPaid:operation.commissionPaid?'Sim':'Não',commissionInstallments:String(operation.commissionInstallments),commissionDueDate:operation.revenueDueDate,
   adhesionFee:operation.adhesionFee,advisoryFee:operation.advisoryFee,bonus:operation.bonus,quotaQuantity:String(operation.quotaQuantity||1),quotaUnitValue:operation.quotaUnitValue,fipeValue:operation.fipeValue,postSale:operation.postSale,postSaleNotes:operation.postSaleNotes,
   vehiclePlate:operation.vehiclePlate,vehicleValue:operation.vehicleValue,financedValue:operation.financedValue,desiredCredit:operation.desiredCredit,loanValue:operation.value,
   ...(operation.completedAt?{operationDate:operation.date,paidDate:operation.paidDate,contractStatus:operation.status}:{})}:{};
  return {...base,...canonical,id:r.id,stage:r.stage,status:r.status,needsCompletion:Boolean(r.needs_completion),createdAt:r.created_at||r.updated_at,updatedAt:r.updated_at,clientId:r.client_id,operationId:r.operation_id,source:r.source,assignedUserId:r.assigned_user_id,assignedName:r.assigned_name};
 })});
}

export async function POST(request:Request){
 const user=await getTfAccess();if(!user||!hasTfPermission(user,'atendimento'))return json({error:'Não autorizado'},401);
 const body=await request.json() as Record<string,string>,cpf=cleanCpf(body.cpf||'');
 if(!body.name?.trim()||cpf.length!==11||!body.birthDate||!body.product)return json({error:'Preencha nome, CPF, nascimento e produto.'},400);
 const now=Date.now(),name=body.name.trim(),birthDate=isoDate(body.birthDate);
 let client=await env.DB.prepare('SELECT id FROM clients WHERE owner_id IN (?,?) AND cpf=? AND deleted_at IS NULL').bind(user.ownerKeys[0],user.ownerKeys[1],cpf).first<{id:number}>();
 if(client)await env.DB.prepare('UPDATE clients SET updated_at=? WHERE id=?').bind(now,client.id).run();
 else client=await env.DB.prepare('INSERT INTO clients (owner_id,name,normalized_name,cpf,birth_date,notes,source_row,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id').bind(user.ownerKey,name,norm(name),cpf,birthDate,'Criado pelo Kanban','Kanban',now,now).first<{id:number}>();
 if(!client)return json({error:'Não foi possível criar o cliente.'},500);
 const assignedUserId=await resolveAssignee(user,body.assignedUserId);
 if(assignedUserId===undefined)return json({error:'Responsável inválido.'},400);
 const operation=await env.DB.prepare("INSERT INTO operations (owner_id,assigned_user_id,client_id,original_product,category,producer,origin,value_cents,operation_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'Kanban',0,?,'em_atendimento',?,?) RETURNING id").bind(user.ownerKey,assignedUserId,client.id,body.product,body.operationType||body.product,user.role==='employee'?user.displayName:'Thiago',new Date().toISOString().slice(0,10),now,now).first<{id:number}>();
 if(!operation)return json({error:'Não foi possível criar a operação.'},500);
 const requestedValue=body.financedValue||body.desiredCredit||body.loanValue||'';
 const phone=phoneBr(body.phone);
 if(phone)await env.DB.prepare('UPDATE clients SET phone=?,updated_at=? WHERE id=?').bind(phone,now,client.id).run();
 const payload={name,cpf,birthDate,phone,product:body.product,operationType:body.operationType||body.product,vehiclePlate:body.vehiclePlate||'',vehicleValue:body.vehicleValue||'',financedValue:body.financedValue||'',desiredCredit:body.desiredCredit||'',loanValue:body.loanValue||'',returnAt:'',returnReason:'',returnNotes:'',returnStatus:'',lastConversation:'',history:[]};
 await env.DB.prepare("UPDATE operations SET vehicle_plate=?,vehicle_value_cents=?,financed_value_cents=?,desired_credit_cents=?,value_cents=?,updated_at=? WHERE id=?").bind(body.vehiclePlate||null,moneyBr(body.vehicleValue),moneyBr(body.financedValue),moneyBr(body.desiredCredit||requestedValue),moneyBr(requestedValue),now,operation.id).run();
 const row=await env.DB.prepare("INSERT INTO deals (owner_id,assigned_user_id,client_id,operation_id,title,payload_json,stage,status,updated_at,created_at,needs_completion,source,probability) VALUES (?,?,?,?,?,?,'atendimento','aberto',?,?,0,'Kanban',0) RETURNING id,assigned_user_id as assignedUserId,stage,status,created_at as createdAt,updated_at as updatedAt").bind(user.ownerKey,assignedUserId,client.id,operation.id,JSON.stringify(payload),JSON.stringify(payload),now,now).first<any>();
 if(!row)return json({error:'Não foi possível iniciar o atendimento.'},500);
 await history(user.ownerKey,row.id,operation.id,'criacao','Atendimento criado pelo Kanban.',null,{stage:'atendimento'});
 return json({deal:{...row,...payload,needsCompletion:false,clientId:client.id,operationId:operation.id,source:'Kanban'}},201);
}

export async function PATCH(request:Request){
 const user=await getTfAccess();if(!user||!hasTfPermission(user,'atendimento'))return json({error:'Não autorizado'},401);
 const body=await request.json() as Record<string,unknown>,id=Number(body.id),stage=String(body.stage||'');
 if(id&&body.action==='edit'){
  const current=await ownedDeal(user,id);
  if(!current)return json({error:'Atendimento não encontrado.'},404);
  const base=parse(current.payload_json||current.title),d=(body.details||{}) as Record<string,string>;
  const name=String(d.name||base.name||'').trim(),cpf=cleanCpf(String(d.cpf||base.cpf||'')),birthDate=isoDate(d.birthDate||base.birthDate),product=String(d.product||base.product||'').trim(),phone=phoneBr(d.phone??base.phone??'');
  if(!name||cpf.length!==11||!birthDate||!product)return json({error:'Confira nome, CPF, nascimento e produto.'},400);
  const now=Date.now(),payload={...base,...d,name,cpf,birthDate,product,phone};
  const statements=[env.DB.prepare('UPDATE deals SET title=?,payload_json=?,updated_at=? WHERE id=?').bind(JSON.stringify(payload),JSON.stringify(payload),now,id)];
  try {
   if(current.operation_id){
    const patch:Record<string,unknown>={name,cpf,birthDate,phone,product};
    for(const key of ['vehiclePlate','vehicleValue','financedValue','desiredCredit'])if(d[key]!=null)patch[key]=d[key];
    const amount=d.financedValue||d.desiredCredit||d.loanValue;
    if(amount!=null&&amount!=='')patch.value=amount;
    await updateOperationRecord(env.DB,user,Number(current.operation_id),patch);
   }else if(current.client_id)await updateClientRecord(env.DB,user,Number(current.client_id),{name,cpf,birthDate,phone});
  }catch(error){if(error instanceof RecordUpdateError)return json({error:error.message},error.status);throw error;}
  statements.push(env.DB.prepare("INSERT INTO deal_history (owner_id,deal_id,operation_id,event_type,description,before_json,after_json,source,created_at) VALUES (?,?,?,?,?,?,?,'Gestão TF',?)").bind(user.ownerKey,id,current.operation_id||null,'edicao','Dados do atendimento editados.',JSON.stringify(base),JSON.stringify(payload),now));
  await env.DB.batch(statements);
  return json({ok:true,deal:{...payload,id,stage:current.stage,status:current.status,needsCompletion:Boolean(current.needs_completion),updatedAt:now,clientId:current.client_id,operationId:current.operation_id,source:current.source}});
 }
 if(id&&body.action==='schedule_return'){
  const current=await ownedDeal(user,id);
  if(!current)return json({error:'Atendimento não encontrado.'},404);
  const base=parse(current.payload_json||current.title),now=Date.now();
  const returnAt=String(body.returnAt||''),returnReason=String(body.returnReason||'').trim(),returnNotes=String(body.returnNotes||'').trim(),phone=phoneBr(body.phone||base.phone||'');
  if(!returnAt||!returnReason)return json({error:'Informe data, horário e motivo do retorno.'},400);
  const entry={at:now,type:'retorno_agendado',conversation:returnNotes,returnAt,reason:returnReason};
  const payload={...base,phone,returnAt,returnReason,returnNotes,returnStatus:'pendente',lastConversation:returnNotes||base.lastConversation||'',history:[...(Array.isArray(base.history)?base.history:[]),entry]};
  await env.DB.prepare('UPDATE deals SET payload_json=?,updated_at=? WHERE id=?').bind(JSON.stringify(payload),now,id).run();
  if(current.client_id&&phone)await env.DB.prepare('UPDATE clients SET phone=?,updated_at=? WHERE id=?').bind(phone,now,current.client_id).run();
  await history(user.ownerKey,id,current.operation_id,'retorno_agendado',`Retorno agendado para ${returnAt}: ${returnReason}. ${returnNotes}`,base,payload);
  return json({ok:true,deal:{...payload,id,stage:current.stage,status:current.status,needsCompletion:Boolean(current.needs_completion),updatedAt:now}});
 }
 if(id&&body.action==='resume_flow'){
  const current=await ownedDeal(user,id);
  if(!current)return json({error:'Atendimento não encontrado.'},404);
  const allowedStages=['atendimento','analise','indecisao','fechamento','assinatura','contratado'];
  const resumeStage=String(body.resumeStage||'');
  if(!allowedStages.includes(resumeStage))return json({error:'Escolha uma etapa válida para reiniciar o fluxo.'},400);
  const base=parse(current.payload_json||current.title),now=Date.now();
  const entry={at:now,type:'fluxo_reiniciado',conversation:`Fluxo reiniciado em ${resumeStage}.`,returnAt:base.returnAt||''};
  const payload={...base,returnAt:'',returnReason:'',returnStatus:'concluido',history:[...(Array.isArray(base.history)?base.history:[]),entry]};
  await env.DB.prepare("UPDATE deals SET stage=?,status='aberto',needs_completion=0,payload_json=?,updated_at=? WHERE id=?").bind(resumeStage,JSON.stringify(payload),now,id).run();
  if(current.operation_id)await env.DB.prepare('UPDATE operations SET status=?,updated_at=? WHERE id=?').bind(resumeStage,now,current.operation_id).run();
  await history(user.ownerKey,id,current.operation_id,'fluxo_reiniciado',`Atendimento retomado na etapa ${resumeStage}.`,{stage:current.stage,returnAt:base.returnAt},{stage:resumeStage,returnStatus:'concluido'});
  return json({ok:true,deal:{...payload,id,stage:resumeStage,status:'aberto',needsCompletion:false,updatedAt:now}});
 }
 if(id&&body.action==='complete_return'){
  const current=await ownedDeal(user,id);
  if(!current)return json({error:'Atendimento não encontrado.'},404);
  const base=parse(current.payload_json||current.title),now=Date.now(),entry={at:now,type:'retorno_concluido',conversation:String(body.notes||base.returnNotes||'')};
  const payload={...base,returnStatus:'concluido',history:[...(Array.isArray(base.history)?base.history:[]),entry]};
  await env.DB.prepare('UPDATE deals SET payload_json=?,updated_at=? WHERE id=?').bind(JSON.stringify(payload),now,id).run();
  await history(user.ownerKey,id,current.operation_id,'retorno_concluido','Retorno concluído.',base,payload);
  return json({ok:true,deal:{...payload,id,stage:current.stage,status:current.status,needsCompletion:Boolean(current.needs_completion),updatedAt:now}});
 }
 const allowed=['atendimento','analise','indecisao','fechamento','assinatura','contratado','finalizado','cancelado'];
 if(!id||!allowed.includes(stage))return json({error:'Etapa inválida.'},400);
 const current=await ownedDeal(user,id);
 if(!current)return json({error:'Atendimento não encontrado.'},404);
 const now=Date.now(),base=parse(current.payload_json||current.title);
 if(stage!=='finalizado'||!body.details){
  const status=stage==='finalizado'?'aguardando_cadastro':stage==='cancelado'?'cancelado':'aberto',needs=stage==='finalizado'?1:0;
  await env.DB.prepare('UPDATE deals SET stage=?,status=?,needs_completion=?,updated_at=? WHERE id=?').bind(stage,status,needs,now,id).run();
  if(current.operation_id)await env.DB.prepare('UPDATE operations SET status=?,updated_at=? WHERE id=?').bind(status==='aberto'?stage:status,now,current.operation_id).run();
  await history(user.ownerKey,id,current.operation_id,'mudanca_etapa',`Etapa alterada de ${current.stage} para ${stage}.`,{stage:current.stage,status:current.status},{stage,status,needsCompletion:Boolean(needs)});
  return json({ok:true,stage,status,needsCompletion:Boolean(needs)});
 }
 const d=body.details as Record<string,string>,documentType=String(d.documentType||'CPF'),cpf=documentType==='CPF'?cleanCpf(String(d.cpf||base.cpf||'')):'',benefit=documentType==='Benefício'?String(d.benefit||'').trim():String(d.benefit||'').trim();
 if(documentType==='CPF'&&cpf.length!==11)return json({error:'Confira o CPF antes de concluir.'},400);
 if(documentType==='Benefício'&&!benefit)return json({error:'Informe o número do benefício antes de concluir.'},400);
 const required=[d.name||base.name,d.birthDate||base.birthDate,d.bank,d.product,d.operationType,d.producer,d.origin,d.value,d.contractStatus,d.operationDate];
 if(required.some(value=>!String(value||'').trim()))return json({error:'Preencha todos os dados obrigatórios da operação.'},400);
 const operationStatus=/pago|finalizado/i.test(String(d.contractStatus||''))?'Finalizado':String(d.contractStatus||'Finalizado'),paidAt=['Finalizado','Concluído'].includes(operationStatus)?(isoDate(d.paidDate)||new Date().toISOString().slice(0,10)):null,operationOrigin=d.origin==='Sem parceiro'?'TF':d.origin;
 const selectedCommissionRate=Number(String(d.commissionRate||'0').replace(',','.')),customCommissionRate=Number(String(d.commissionCustomRate||'0').replace(',','.')),commissionRate=Number.isFinite(customCommissionRate)&&customCommissionRate>0?customCommissionRate:selectedCommissionRate,commissionValueCents=Number.isFinite(commissionRate)&&commissionRate>0?Math.round(moneyBr(d.value)*commissionRate/100):0,adhesionFeeCents=moneyBr(d.adhesionFee),advisoryFeeCents=moneyBr(d.advisoryFee),bonusCents=moneyBr(d.bonus);
 const hasRevenue=commissionValueCents>0||adhesionFeeCents>0||advisoryFeeCents>0||bonusCents>0;
 if(hasRevenue&&d.commissionPaid!=='Sim'&&!isoDate(d.commissionDueDate))return json({error:'Informe o primeiro vencimento das receitas.'},400);
 if(d.invoiceRequired==='Sim'&&(!String(d.invoiceNumber||'').trim()||moneyBr(d.invoiceValue)<=0||!isoDate(d.invoiceIssuedAt)))return json({error:'Preencha número, valor e data da nota fiscal.'},400);
 let partnerId:number|null=null;
 if(!['Balcão','TF'].includes(operationOrigin)){
  let partner=await env.DB.prepare("SELECT id FROM partners WHERE owner_id IN (?,?) AND lower(name)=lower(?) AND deleted_at IS NULL LIMIT 1").bind(user.ownerKeys[0],user.ownerKeys[1],operationOrigin).first<{id:number}>();
  if(!partner)partner=await env.DB.prepare("INSERT INTO partners (owner_id,name,active,created_at,updated_at) VALUES (?,?,1,?,?) RETURNING id").bind(user.ownerKey,operationOrigin,now,now).first<{id:number}>();
  partnerId=partner?.id||null;
 }
 let client=current.client_id?{id:Number(current.client_id)}:cpf?await env.DB.prepare('SELECT id FROM clients WHERE owner_id IN (?,?) AND cpf=? AND deleted_at IS NULL').bind(user.ownerKeys[0],user.ownerKeys[1],cpf).first<{id:number}>():await env.DB.prepare('SELECT id FROM clients WHERE owner_id IN (?,?) AND benefit_number=? AND deleted_at IS NULL').bind(user.ownerKeys[0],user.ownerKeys[1],benefit).first<{id:number}>();
 if(client&&!current.operation_id)await env.DB.prepare('UPDATE clients SET name=?,normalized_name=?,cpf=COALESCE(?,cpf),benefit_number=COALESCE(?,benefit_number),birth_date=?,phone=?,updated_at=? WHERE id=?').bind(d.name||base.name,norm(d.name||base.name),cpf||null,benefit||null,isoDate(d.birthDate||base.birthDate),phoneBr(d.phone||base.phone)||null,now,client.id).run();
 else if(!client)client=await env.DB.prepare('INSERT INTO clients (owner_id,name,normalized_name,cpf,benefit_number,birth_date,phone,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id').bind(user.ownerKey,d.name||base.name,norm(d.name||base.name),cpf||null,benefit||null,isoDate(d.birthDate||base.birthDate),phoneBr(d.phone||base.phone)||null,now,now).first<{id:number}>();
 if(!client)return json({error:'Não foi possível concluir o cliente.'},500);
 const operationNotes=JSON.stringify({agreement:d.agreement||'',contractType:d.contractType||d.product||'',dueDay:d.dueDay||'',productionIndicator:d.productionIndicator||'',adhesionFeeCents,advisoryFeeCents,bonusCents,commissionRate,commissionCustomRate:customCommissionRate>0?customCommissionRate:0,commissionInstallments:Number(d.commissionInstallments||1),commissionPaid:d.commissionPaid==='Sim',invoiceRequired:d.invoiceRequired==='Sim',quotaQuantity:Number(d.quotaQuantity||0),quotaUnitValueCents:moneyBr(d.quotaUnitValue),fipeValueCents:moneyBr(d.fipeValue),postSale:d.postSale,postSaleNotes:d.postSaleNotes||''});
 let operationId=Number(current.operation_id||0);
 if(!operationId){
  const op=await env.DB.prepare("INSERT INTO operations (owner_id,assigned_user_id,client_id,partner_id,bank,promoter,original_product,category,producer,origin,benefit_number,value_cents,installment_cents,term,operation_date,paid_at,completed_at,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id").bind(user.ownerKey,current.assigned_user_id||null,client.id,partnerId,d.bank,d.promoter||null,d.product||base.product,d.operationType,d.producer,operationOrigin,benefit||null,moneyBr(d.value),moneyBr(d.installment),Number(d.term||0),isoDate(d.operationDate)||new Date().toISOString().slice(0,10),paidAt,new Date().toISOString(),operationStatus,operationNotes,now,now).first<{id:number}>();
  if(!op)return json({error:'Não foi possível concluir a operação.'},500);operationId=op.id;
 }
 let updatedOperation;
 try{
  updatedOperation=await updateOperationRecord(env.DB,user,operationId,{...d,name:d.name||base.name,...(cpf?{cpf}:{}),birthDate:d.birthDate||base.birthDate,phone:phoneBr(d.phone||base.phone),
   origin:operationOrigin,commissionRate,commissionPaid:d.commissionPaid,revenueDueDate:isoDate(d.commissionDueDate)||paidAt||isoDate(d.operationDate),
   status:operationStatus,paidAt,completedAt:new Date().toISOString()});
 }catch(error){if(error instanceof RecordUpdateError)return json({error:error.message},error.status);throw error;}
 const pendingRows=await env.DB.prepare("SELECT id,value_cents,expected_at,status,notes FROM commissions WHERE operation_id=? AND deleted_at IS NULL AND value_cents>0 AND status NOT IN ('recebida','paga','historica','cancelada') AND (rate_bps IS NOT NULL OR notes IN ('Taxa de adesão','Taxa de assessoria','Bonificação'))").bind(operationId).all<{id:number;value_cents:number;expected_at:string|null;status:string;notes:string|null}>();
 const receivables=pendingRows.results.map(item=>({id:item.id,operationId,name:updatedOperation.clientName,value:Number(item.value_cents)/100,dueDate:item.expected_at||'',status:item.status,type:item.notes||'Comissão',product:updatedOperation.product}));
 if(d.invoiceRequired==='Sim'){
  const number=String(d.invoiceNumber).trim(),issuedAt=isoDate(d.invoiceIssuedAt),invoicePaid=d.invoicePaid==='Sim',invoiceStatus=invoicePaid?'paga':'pendente',invoicePaidAt=invoicePaid?issuedAt:null,invoiceValue=moneyBr(d.invoiceValue);
  const existingInvoice=await env.DB.prepare('SELECT id FROM invoices WHERE owner_id IN (?,?) AND number=? AND deleted_at IS NULL LIMIT 1').bind(user.ownerKeys[0],user.ownerKeys[1],number).first<{id:number}>();
  if(existingInvoice)await env.DB.prepare('UPDATE invoices SET client_id=?,partner_id=?,value_cents=?,issued_at=?,paid_at=?,status=?,notes=?,updated_at=? WHERE id=?').bind(client.id,partnerId,invoiceValue,issuedAt,invoicePaidAt,invoiceStatus,`Gerada pela operação ${operationId}`,now,existingInvoice.id).run();
  else await env.DB.prepare('INSERT INTO invoices (owner_id,number,client_id,partner_id,value_cents,issued_at,paid_at,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(user.ownerKey,number,client.id,partnerId,invoiceValue,issuedAt,invoicePaidAt,invoiceStatus,`Gerada pela operação ${operationId}`,now,now).run();
 }else if(base.invoiceNumber){
  await env.DB.prepare('UPDATE invoices SET deleted_at=?,updated_at=? WHERE owner_id IN (?,?) AND number=? AND deleted_at IS NULL').bind(now,now,user.ownerKeys[0],user.ownerKeys[1],String(base.invoiceNumber)).run();
 }
 const payload={...base,...d,origin:operationOrigin,cpf:cpf||base.cpf||'',benefit};
 await env.DB.prepare("UPDATE deals SET client_id=?,operation_id=?,title=?,payload_json=?,stage='finalizado',status='concluido',needs_completion=0,updated_at=? WHERE id=?").bind(client.id,operationId,JSON.stringify(payload),JSON.stringify(payload),now,id).run();
 await history(user.ownerKey,id,operationId,'cadastro_finalizado','Cadastro final concluído. Produção e relatórios atualizados.',{status:current.status,needsCompletion:Boolean(current.needs_completion)},{stage:'finalizado',status:'concluido',needsCompletion:false});
 return json({ok:true,stage:'finalizado',status:'concluido',needsCompletion:false,clientId:client.id,operationId,receivables});
}

export async function DELETE(request:Request){
 const user=await getTfAccess();if(!user||!hasTfPermission(user,'atendimento'))return json({error:'Não autorizado'},401);
 const id=Number(new URL(request.url).searchParams.get('id'));if(!id)return json({error:'Atendimento inválido.'},400);
 const current=await ownedDeal(user,id);if(!current)return json({error:'Atendimento não encontrado.'},404);
 const now=Date.now();await env.DB.prepare("UPDATE deals SET stage='cancelado',status='excluido',updated_at=? WHERE id=?").bind(now,id).run();
 if(current.operation_id)await env.DB.prepare("UPDATE operations SET status='cancelado',deleted_at=?,updated_at=? WHERE id=?").bind(now,now,current.operation_id).run();
 await history(user.ownerKey,id,current.operation_id,'exclusao','Atendimento excluído no Gestão TF.',current,{stage:'cancelado',status:'excluido'});
 return json({ok:true});
}

async function history(ownerId:string,dealId:number,operationId:number|null,type:string,description:string,before:unknown,after:unknown){await env.DB.prepare("INSERT INTO deal_history (owner_id,deal_id,operation_id,event_type,description,before_json,after_json,source,created_at) VALUES (?,?,?,?,?,?,?,'Gestão TF',?)").bind(ownerId,dealId,operationId||null,type,description,before?JSON.stringify(before):null,after?JSON.stringify(after):null,Date.now()).run();}

async function ownedDeal(access:TfAccess,id:number){
 const sql=access.role==='employee'?'SELECT * FROM deals WHERE id=? AND owner_id IN (?,?) AND assigned_user_id=?':'SELECT * FROM deals WHERE id=? AND owner_id IN (?,?)';
 return (access.role==='employee'?env.DB.prepare(sql).bind(id,access.ownerKeys[0],access.ownerKeys[1],access.memberId):env.DB.prepare(sql).bind(id,access.ownerKeys[0],access.ownerKeys[1])).first<Record<string,any>>();
}
async function resolveAssignee(access:TfAccess,value:unknown):Promise<number|null|undefined>{
 if(access.role==='employee')return access.memberId;
 const id=Number(value||0);if(!id)return null;
 const row=await env.DB.prepare('SELECT id FROM access_users WHERE id=? AND owner_id=? AND active=1').bind(id,access.ownerKey).first<{id:number}>();
 return row?.id;
}

async function reconcileImportedCompletions(access:TfAccess){
 const pending=await env.DB.prepare("SELECT id,title,payload_json FROM deals WHERE owner_id IN (?,?) AND stage='finalizado' AND status='aguardando_cadastro'").bind(access.ownerKeys[0],access.ownerKeys[1]).all<{id:number;title:string;payload_json:string|null}>();
 for(const deal of pending.results){
  const data=parse(deal.payload_json||deal.title),cpf=cleanCpf(String(data.cpf||''));if(cpf.length!==11)continue;
  const match=await env.DB.prepare("SELECT c.id client_id,o.id operation_id FROM clients c JOIN operations o ON o.client_id=c.id WHERE c.owner_id IN (?,?) AND o.owner_id IN (?,?) AND c.cpf=? AND c.deleted_at IS NULL AND o.deleted_at IS NULL AND o.completed_at IS NOT NULL ORDER BY o.operation_date DESC,o.id DESC LIMIT 1").bind(access.ownerKeys[0],access.ownerKeys[1],access.ownerKeys[0],access.ownerKeys[1],cpf).first<{client_id:number;operation_id:number}>();
  if(!match)continue;const now=Date.now();
  await env.DB.batch([
   env.DB.prepare("UPDATE deals SET client_id=?,operation_id=?,stage='finalizado',status='concluido',needs_completion=0,updated_at=? WHERE id=?").bind(match.client_id,match.operation_id,now,deal.id),
   env.DB.prepare("INSERT INTO deal_history (owner_id,deal_id,operation_id,event_type,description,before_json,after_json,source,created_at) VALUES (?,?,?,?,?,?,?,'Gestão TF',?)").bind(access.ownerKey,deal.id,match.operation_id,'cadastro_vinculado','Cartão vinculado automaticamente à operação já concluída.',JSON.stringify({status:'aguardando_cadastro'}),JSON.stringify({status:'concluido',clientId:match.client_id,operationId:match.operation_id}),now)
  ]);
 }
}
