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
 const employeeClause=user.role==='employee'?' AND d.assigned_user_id=?':'';
 const statement=env.DB.prepare(`SELECT d.id,d.title,d.payload_json,d.stage,d.status,d.needs_completion,d.created_at,d.updated_at,d.client_id,d.operation_id,d.source,d.assigned_user_id,a.name assigned_name FROM deals d LEFT JOIN access_users a ON a.id=d.assigned_user_id WHERE d.owner_id IN (?,?) AND d.stage!='cancelado' AND d.status NOT IN ('excluido','concluido')${employeeClause} ORDER BY d.updated_at DESC`);
 const rows=await (user.role==='employee'?statement.bind(user.ownerKeys[0],user.ownerKeys[1],user.memberId):statement.bind(user.ownerKeys[0],user.ownerKeys[1])).all();
 const operationIds=Array.from(new Set(rows.results.map(row=>Number(row.operation_id)).filter(Boolean)));
 const operations=new Map((await readOperations(env.DB,user,{ids:operationIds,includeIncomplete:true})).map(operation=>[operation.dbId,operation]));
 return json({deals:rows.results.map((r:any)=>{
  const base=parse(r.payload_json||r.title),operation=operations.get(Number(r.operation_id));
  const canonical=operation?{name:operation.clientName,cpf:operation.clientCpf,birthDate:operation.clientBirthDate,phone:operation.clientPhone,benefit:operation.clientBenefit,
   product:operation.product,bank:operation.bank,producer:operation.producer,origin:operation.origin,promoter:operation.promoter,operationType:operation.operationType,
   agreement:operation.agreement,guaranteeType:operation.guaranteeType,contractType:operation.contractType,dueDay:operation.dueDay,productionIndicator:operation.productionIndicator,
   value:operation.value,installment:operation.installment,term:String(operation.term||''),commissionRate:String(operation.commissionRate),commissionCustomRate:'',commissionPaid:operation.commissionPaid?'Sim':'Não',commissionInstallments:String(operation.commissionInstallments),commissionDueDate:operation.revenueDueDate,
   adhesionFee:operation.adhesionFee,advisoryFee:operation.advisoryFee,bonus:operation.bonus,quotaQuantity:String(operation.quotaQuantity||1),quotaUnitValue:operation.quotaUnitValue,fipeValue:operation.fipeValue,postSale:operation.postSale,postSaleNotes:operation.postSaleNotes,
   vehiclePlate:operation.vehiclePlate,vehicleValue:operation.vehicleValue,downPayment:operation.downPayment,financedValue:operation.financedValue,desiredCredit:operation.desiredCredit,loanValue:operation.value,
   ...(operation.completedAt?{operationDate:operation.date,paidDate:operation.paidDate,contractStatus:operation.status}:{})}:{};
  return {...base,...canonical,id:r.id,stage:r.stage,status:r.status,needsCompletion:Boolean(r.needs_completion),createdAt:r.created_at||r.updated_at,updatedAt:r.updated_at,clientId:r.client_id,operationId:r.operation_id,source:r.source,assignedUserId:r.assigned_user_id,assignedName:r.assigned_name};
 })});
}

export async function POST(request:Request){
 const user=await getTfAccess();if(!user||!hasTfPermission(user,'atendimento'))return json({error:'Não autorizado'},401);
 const body=await request.json() as Record<string,string>,cpf=cleanCpf(String(body.cpf||''));
 const name=String(body.name||'').trim(),product=String(body.product||'').trim();
 if(!name||!product)return json({error:'Informe o nome do cliente e o serviço.'},400);
 if(cpf&&cpf.length!==11)return json({error:'Confira o CPF ou deixe o campo em branco.'},400);
 if(body.guaranteeType&&!['Veículo','Imobiliário'].includes(body.guaranteeType))return json({error:'Tipo de garantia inválido.'},400);
 const assignedUserId=await resolveAssignee(user,body.assignedUserId);
 if(assignedUserId===undefined)return json({error:'Responsável inválido.'},400);
 const now=Date.now(),birthDate=isoDate(body.birthDate),phone=phoneBr(body.phone);
 const requestedValue=product==='Financiamento'?body.financedValue:body.desiredCredit||body.loanValue||body.financedValue;
 const amounts={vehicleValue:moneyBr(body.vehicleValue),downPayment:moneyBr(body.downPayment),financedValue:moneyBr(body.financedValue),desiredCredit:moneyBr(product==='Financiamento'?body.desiredCredit:requestedValue)};
 if(Object.values(amounts).some(value=>value<0))return json({error:'Os valores não podem ser negativos.'},400);
 try {
  const deal=await env.DB.transaction(async client=>{
   // Serialize creation for one CPF and never match clients with a missing CPF.
   if(cpf)await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${user.ownerKey}:${cpf}`]);
   let customer=cpf?(await client.query('SELECT id,name,cpf,birth_date,phone FROM clients WHERE owner_id=ANY($1::text[]) AND cpf=$2 AND deleted_at IS NULL FOR UPDATE',[user.ownerKeys,cpf])).rows[0]:null;
   if(customer&&norm(customer.name)!==norm(name))throw new RecordUpdateError('Este CPF já pertence a outro cliente. Confira o CPF antes de salvar este atendimento.',409);
   if(!customer)customer=(await client.query('INSERT INTO clients (owner_id,name,normalized_name,cpf,birth_date,phone,notes,source_row,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id,name,cpf,birth_date,phone',[user.ownerKey,name,norm(name),cpf||null,birthDate||null,phone||null,'Criado pelo Kanban','Kanban',now])).rows[0];
   else customer=(await client.query("UPDATE clients SET birth_date=COALESCE(NULLIF(birth_date,''),$1),phone=COALESCE(NULLIF(phone,''),$2),updated_at=$3 WHERE id=$4 RETURNING id,name,cpf,birth_date,phone",[birthDate||null,phone||null,now,customer.id])).rows[0];
   const guaranteeType=body.guaranteeType||'',operationType=body.operationType||(guaranteeType==='Imobiliário'?'Garantia de imóvel':guaranteeType==='Veículo'?'Garantia de veículo':product);
   const notes=JSON.stringify({guaranteeType,...(guaranteeType?{agreement:guaranteeType==='Imobiliário'?'Imóvel':'Veículo'}:{})});
   const operation=(await client.query("INSERT INTO operations (owner_id,assigned_user_id,client_id,original_product,category,producer,origin,value_cents,operation_date,status,vehicle_plate,vehicle_value_cents,financed_value_cents,desired_credit_cents,down_payment_cents,notes,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,'Kanban',$7,$8,'em_atendimento',$9,$10,$11,$12,$13,$14,$15,$15) RETURNING id",[user.ownerKey,assignedUserId,customer.id,product,operationType,user.role==='employee'?user.displayName:'Thiago',moneyBr(requestedValue),new Date().toISOString().slice(0,10),body.vehiclePlate||null,amounts.vehicleValue,amounts.financedValue,amounts.desiredCredit,amounts.downPayment,notes,now])).rows[0];
   const payload={name:customer.name,cpf:customer.cpf||'',birthDate:customer.birth_date||'',phone:customer.phone||'',product,operationType,guaranteeType,vehiclePlate:body.vehiclePlate||'',vehicleValue:amounts.vehicleValue/100,downPayment:amounts.downPayment/100,financedValue:amounts.financedValue/100,desiredCredit:amounts.desiredCredit/100,loanValue:moneyBr(body.loanValue)/100,value:moneyBr(requestedValue)/100,returnAt:'',returnReason:'',returnNotes:'',returnStatus:'',lastConversation:'',history:[]};
   const row=(await client.query("INSERT INTO deals (owner_id,assigned_user_id,client_id,operation_id,title,payload_json,stage,status,updated_at,created_at,needs_completion,source,probability) VALUES ($1,$2,$3,$4,$5,$5,'atendimento','aberto',$6,$6,0,'Kanban',0) RETURNING id,assigned_user_id AS \"assignedUserId\",stage,status,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",[user.ownerKey,assignedUserId,customer.id,operation.id,JSON.stringify(payload),now])).rows[0];
   await client.query("INSERT INTO deal_history (owner_id,deal_id,operation_id,event_type,description,after_json,source,created_at) VALUES ($1,$2,$3,'criacao','Atendimento criado pelo Kanban.',$4,'Gestão TF',$5)",[user.ownerKey,row.id,operation.id,JSON.stringify({stage:'atendimento'}),now]);
   return {...row,...payload,needsCompletion:false,clientId:customer.id,operationId:operation.id,source:'Kanban'};
  });
  return json({deal},201);
 }catch(error){if(error instanceof RecordUpdateError)return json({error:error.message},error.status);if((error as {code?:string}).code==='23505')return json({error:'Este CPF já está cadastrado. Confira os dados do cliente.'},409);throw error;}
}

export async function PATCH(request:Request){
 const user=await getTfAccess();if(!user||!hasTfPermission(user,'atendimento'))return json({error:'Não autorizado'},401);
 const body=await request.json() as Record<string,unknown>,id=Number(body.id),stage=String(body.stage||'');
 if(id&&body.action==='edit'){
  const current=await ownedDeal(user,id);
  if(!current)return json({error:'Atendimento não encontrado.'},404);
  const d=(body.details||{}) as Record<string,string>;
  const editableFields=['name','cpf','birthDate','phone','product','operationType','guaranteeType','vehiclePlate','vehicleValue','downPayment','financedValue','desiredCredit','loanValue'];
  const patch:Record<string,unknown>=Object.fromEntries(Object.entries(d).filter(([key])=>editableFields.includes(key)));
  if('name' in d&&!String(d.name||'').trim())return json({error:'Informe o nome do cliente.'},400);
  if('cpf' in d){patch.cpf=cleanCpf(String(d.cpf||''));if(patch.cpf&&String(patch.cpf).length!==11)return json({error:'Confira o CPF ou deixe o campo em branco.'},400);}
  if('phone' in d)patch.phone=phoneBr(d.phone);
  if('birthDate' in d)patch.birthDate=isoDate(d.birthDate);
  if('product' in d&&!String(d.product||'').trim())return json({error:'Informe o serviço.'},400);
  if(d.guaranteeType){
   if(!['Veículo','Imobiliário'].includes(d.guaranteeType))return json({error:'Tipo de garantia inválido.'},400);
   patch.agreement=d.guaranteeType==='Imobiliário'?'Imóvel':'Veículo';
   patch.operationType=d.guaranteeType==='Imobiliário'?'Garantia de imóvel':'Garantia de veículo';
  }
  const base=parse(current.payload_json||current.title),product=d.product||base.product;
  const amountKey=product==='Financiamento'?'financedValue':'desiredCredit' in d?'desiredCredit':'loanValue' in d?'loanValue':'financedValue';
  if(amountKey in d)patch.value=d[amountKey];
  try {
   const deal=await env.DB.transaction(async client=>{
    const locked=(await client.query('SELECT * FROM deals WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(locked.status==='processando_cadastro')throw new RecordUpdateError('Aguarde a conclusão do cadastro antes de editar.',409);
    const previous=parse(locked.payload_json||locked.title),now=Date.now();
    if(locked.operation_id)await updateOperationRecord(env.DB,user,Number(locked.operation_id),patch,client);
    else if(locked.client_id)await updateClientRecord(env.DB,user,Number(locked.client_id),patch,client);
    const payload={...previous,...patch};
    await client.query('UPDATE deals SET title=$1,payload_json=$1,updated_at=$2 WHERE id=$3',[JSON.stringify(payload),now,id]);
    await client.query("INSERT INTO deal_history (owner_id,deal_id,operation_id,event_type,description,before_json,after_json,source,created_at) VALUES ($1,$2,$3,'edicao','Dados do atendimento editados.',$4,$5,'Gestão TF',$6)",[user.ownerKey,id,locked.operation_id||null,JSON.stringify(previous),JSON.stringify(payload),now]);
    return {...payload,id,stage:locked.stage,status:locked.status,needsCompletion:Boolean(locked.needs_completion),updatedAt:now,clientId:locked.client_id,operationId:locked.operation_id,source:locked.source};
   });
   return json({ok:true,deal});
  }catch(error){if(error instanceof RecordUpdateError)return json({error:error.message},error.status);throw error;}
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
 if(current.status==='concluido'&&current.operation_id){await ensurePostSale(user,Number(current.operation_id),Number(current.client_id));return json({ok:true,stage:'finalizado',status:'concluido',needsCompletion:false,clientId:current.client_id,operationId:current.operation_id,alreadyCompleted:true});}
 const now=Date.now(),base=parse(current.payload_json||current.title);
 if(stage!=='finalizado'||!body.details){
  try {
   const result=await env.DB.transaction(async client=>{
    const fresh=(await client.query('SELECT * FROM deals WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(fresh.status==='processando_cadastro')throw new RecordUpdateError('O cadastro está sendo concluído. Aguarde antes de mudar a etapa.',409);
    if(fresh.status==='concluido')return {stage:'finalizado',status:'concluido',needsCompletion:false,updatedAt:fresh.updated_at};
    if(fresh.status==='excluido')throw new RecordUpdateError('Este atendimento foi excluído.',409);
    const status=stage==='finalizado'?'aguardando_cadastro':stage==='cancelado'?'cancelado':'aberto',needs=stage==='finalizado'?1:0,updatedAt=Math.max(now,Number(fresh.updated_at)+1);
    await client.query('UPDATE deals SET stage=$1,status=$2,needs_completion=$3,updated_at=$4 WHERE id=$5',[stage,status,needs,updatedAt,id]);
    if(fresh.operation_id)await client.query('UPDATE operations SET status=$1,updated_at=$2 WHERE id=$3',[status==='aberto'?stage:status,updatedAt,fresh.operation_id]);
    await client.query("INSERT INTO deal_history (owner_id,deal_id,operation_id,event_type,description,before_json,after_json,source,created_at) VALUES ($1,$2,$3,'mudanca_etapa',$4,$5,$6,'Gestão TF',$7)",[user.ownerKey,id,fresh.operation_id,`Etapa alterada de ${fresh.stage} para ${stage}.`,JSON.stringify({stage:fresh.stage,status:fresh.status}),JSON.stringify({stage,status,needsCompletion:Boolean(needs)}),updatedAt]);
    return {stage,status,needsCompletion:Boolean(needs),updatedAt};
   });
   return json({ok:true,...result});
  }catch(error){if(error instanceof RecordUpdateError)return json({error:error.message},error.status);throw error;}
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
 await env.DB.prepare("UPDATE deals SET status='aguardando_cadastro',updated_at=? WHERE id=? AND status='processando_cadastro' AND updated_at<?").bind(now,id,now-10*60*1000).run();
 const claim=await env.DB.prepare("UPDATE deals SET stage='finalizado',status='processando_cadastro',updated_at=? WHERE id=? AND status IN ('aguardando_cadastro','aberto') RETURNING id").bind(now,id).run();
 if(!claim.results.length){const fresh=await ownedDeal(user,id);if(fresh?.status==='concluido'&&fresh.operation_id){await ensurePostSale(user,Number(fresh.operation_id),Number(fresh.client_id));return json({ok:true,stage:'finalizado',status:'concluido',needsCompletion:false,clientId:fresh.client_id,operationId:fresh.operation_id,alreadyCompleted:true});}return json({error:'Este cadastro já está sendo processado. Aguarde alguns segundos e atualize a tela.'},409);}
 try {
 let partnerId:number|null=null;
 if(!['Balcão','TF'].includes(operationOrigin)){
  let partner=await env.DB.prepare("SELECT id FROM partners WHERE owner_id IN (?,?) AND lower(name)=lower(?) AND deleted_at IS NULL LIMIT 1").bind(user.ownerKeys[0],user.ownerKeys[1],operationOrigin).first<{id:number}>();
  if(!partner)partner=await env.DB.prepare("INSERT INTO partners (owner_id,name,active,created_at,updated_at) VALUES (?,?,1,?,?) RETURNING id").bind(user.ownerKey,operationOrigin,now,now).first<{id:number}>();
  partnerId=partner?.id||null;
 }
 let client=current.client_id?{id:Number(current.client_id)}:cpf?await env.DB.prepare('SELECT id FROM clients WHERE owner_id IN (?,?) AND cpf=? AND deleted_at IS NULL').bind(user.ownerKeys[0],user.ownerKeys[1],cpf).first<{id:number}>():await env.DB.prepare('SELECT id FROM clients WHERE owner_id IN (?,?) AND benefit_number=? AND deleted_at IS NULL').bind(user.ownerKeys[0],user.ownerKeys[1],benefit).first<{id:number}>();
 if(client&&!current.operation_id)await env.DB.prepare('UPDATE clients SET name=?,normalized_name=?,cpf=COALESCE(?,cpf),benefit_number=COALESCE(?,benefit_number),birth_date=?,phone=?,updated_at=? WHERE id=?').bind(d.name||base.name,norm(d.name||base.name),cpf||null,benefit||null,isoDate(d.birthDate||base.birthDate),phoneBr(d.phone||base.phone)||null,now,client.id).run();
 else if(!client)client=await env.DB.prepare('INSERT INTO clients (owner_id,name,normalized_name,cpf,benefit_number,birth_date,phone,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id').bind(user.ownerKey,d.name||base.name,norm(d.name||base.name),cpf||null,benefit||null,isoDate(d.birthDate||base.birthDate),phoneBr(d.phone||base.phone)||null,now,now).first<{id:number}>();
 if(!client)throw new Error('Não foi possível concluir o cliente.');
 const operationNotes=JSON.stringify({agreement:d.agreement||'',contractType:d.contractType||d.product||'',dueDay:d.dueDay||'',productionIndicator:d.productionIndicator||'',adhesionFeeCents,advisoryFeeCents,bonusCents,commissionRate,commissionCustomRate:customCommissionRate>0?customCommissionRate:0,commissionInstallments:Number(d.commissionInstallments||1),commissionPaid:d.commissionPaid==='Sim',invoiceRequired:d.invoiceRequired==='Sim',quotaQuantity:Number(d.quotaQuantity||0),quotaUnitValueCents:moneyBr(d.quotaUnitValue),fipeValueCents:moneyBr(d.fipeValue),postSale:d.postSale,postSaleNotes:d.postSaleNotes||''});
 let operationId=Number(current.operation_id||0);
 if(!operationId){
  const op=await env.DB.prepare("INSERT INTO operations (owner_id,assigned_user_id,client_id,partner_id,bank,promoter,original_product,category,producer,origin,benefit_number,value_cents,installment_cents,term,operation_date,paid_at,completed_at,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id").bind(user.ownerKey,current.assigned_user_id||null,client.id,partnerId,d.bank,d.promoter||null,d.product||base.product,d.operationType,d.producer,operationOrigin,benefit||null,moneyBr(d.value),moneyBr(d.installment),Number(d.term||0),isoDate(d.operationDate)||new Date().toISOString().slice(0,10),paidAt,new Date().toISOString(),operationStatus,operationNotes,now,now).first<{id:number}>();
  if(!op)throw new Error('Não foi possível concluir a operação.');operationId=op.id;
  await env.DB.prepare("UPDATE deals SET client_id=?,operation_id=?,updated_at=? WHERE id=? AND status='processando_cadastro'").bind(client.id,operationId,now,id).run();
 }
 const updatedOperation=await updateOperationRecord(env.DB,user,operationId,{...d,name:d.name||base.name,...(cpf?{cpf}:{}),birthDate:d.birthDate||base.birthDate,phone:phoneBr(d.phone||base.phone),
  origin:operationOrigin,commissionRate,commissionPaid:d.commissionPaid,revenueDueDate:isoDate(d.commissionDueDate)||paidAt||isoDate(d.operationDate),
  status:operationStatus,paidAt,completedAt:new Date().toISOString()});
 const pendingRows=await env.DB.prepare("SELECT id,value_cents,expected_at,status,notes FROM commissions WHERE operation_id=? AND deleted_at IS NULL AND value_cents>0 AND status NOT IN ('recebida','paga','historica','cancelada') AND (rate_bps IS NOT NULL OR notes IN ('Taxa de adesão','Taxa de assessoria','Bonificação'))").bind(operationId).all<{id:number;value_cents:number;expected_at:string|null;status:string;notes:string|null}>();
 const receivables=pendingRows.results.map(item=>({id:item.id,operationId,name:updatedOperation.clientName,value:Number(item.value_cents)/100,dueDate:item.expected_at||'',status:item.status,type:item.notes||'Comissão',product:updatedOperation.product}));
 if(d.invoiceRequired!=='Sim'&&base.invoiceNumber){
  await env.DB.prepare('UPDATE invoices SET deleted_at=?,updated_at=? WHERE owner_id IN (?,?) AND number=? AND deleted_at IS NULL').bind(now,now,user.ownerKeys[0],user.ownerKeys[1],String(base.invoiceNumber)).run();
 }
 await ensurePostSale(user,operationId,client.id);
 const payload={...base,...d,origin:operationOrigin,cpf:cpf||base.cpf||'',benefit};
 await env.DB.prepare("UPDATE deals SET client_id=?,operation_id=?,title=?,payload_json=?,stage='finalizado',status='concluido',needs_completion=0,updated_at=? WHERE id=?").bind(client.id,operationId,JSON.stringify(payload),JSON.stringify(payload),now,id).run();
 await history(user.ownerKey,id,operationId,'cadastro_finalizado','Cadastro final concluído. Produção e relatórios atualizados.',{status:current.status,needsCompletion:Boolean(current.needs_completion)},{stage:'finalizado',status:'concluido',needsCompletion:false});
 return json({ok:true,stage:'finalizado',status:'concluido',needsCompletion:false,clientId:client.id,operationId,receivables});
 } catch(error) {
  await env.DB.prepare("UPDATE deals SET status='aguardando_cadastro',updated_at=? WHERE id=? AND status='processando_cadastro'").bind(Date.now(),id).run();
  if(error instanceof RecordUpdateError)return json({error:error.message},error.status);
  throw error;
 }
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

async function ensurePostSale(access:TfAccess,operationId:number,clientId:number|null){
 if(!operationId||!clientId)return;
 const existing=await env.DB.prepare('SELECT id FROM post_sale_tasks WHERE operation_id=?').bind(operationId).first();
 if(existing)return;
 await env.DB.prepare('INSERT INTO post_sale_tasks (owner_id,operation_id,client_id,status,created_at,updated_at) VALUES (?,?,?,\'pendente\',?,?) ON CONFLICT(operation_id) DO NOTHING').bind(access.ownerKey,operationId,clientId,Date.now(),Date.now()).run();
}

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
