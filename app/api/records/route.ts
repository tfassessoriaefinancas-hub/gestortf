import { ownerIdentity } from '@/lib/auth-session';
import { env } from '@/lib/runtime';
import { getTfAccess, hasTfPermission } from '../../chatgpt-auth';
import { getAugustSeptemberRecords } from '../../../lib/aug-sep-2026';
import { productionSources, hasGgCode } from '../../../lib/production-source';
import { importUpdatedSheet } from '../../../lib/import-updated-sheet';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache'}});
const digits=(value:unknown)=>String(value||'').replace(/\D/g,'');
const norm=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const money=(value:unknown)=>Math.max(0,Math.round(Number(value||0)*100));
const notes=(value:unknown)=>{try{return JSON.parse(String(value||'{}'))}catch{return {}}};
const addMonths=(iso:string,months:number)=>{const [year,month,day]=iso.split('-').map(Number);if(!year||!month||!day)return iso;const date=new Date(Date.UTC(year,month-1+months,1)),lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`};

export async function PUT(){
  const user=await getTfAccess();
  if(!user||user.role!=='admin')return json({error:'Não autorizado'},401);
  const records=await getAugustSeptemberRecords();
  if(!records.length)return json({error:'Nenhuma base de importação local configurada.'},404);
  const ownerId=user.ownerKey,now=Date.now();
  let gg=await env.DB.prepare("SELECT id FROM partners WHERE owner_id IN (?,?) AND lower(name)=lower('GG Veículos') AND deleted_at IS NULL LIMIT 1").bind(user.ownerKeys[0],user.ownerKeys[1]).first<{id:number}>();
  if(!gg)gg=await env.DB.prepare("INSERT INTO partners (owner_id,name,active,created_at,updated_at) VALUES (?,'GG Veículos',1,?,?) RETURNING id").bind(ownerId,now,now).first<{id:number}>();
  let clients=0,operations=0,restored=0,updated=0;
  for(const item of records){
    const cpf=digits(item.document).padStart(11,'0'),phone=item.phone||null;
    let client=await env.DB.prepare('SELECT id,owner_id,deleted_at FROM clients WHERE owner_id IN (?,?) AND cpf=? ORDER BY id DESC LIMIT 1').bind(user.ownerKeys[0],user.ownerKeys[1],cpf).first<{id:number;owner_id:string;deleted_at:number|null}>();
    if(!client){
      client=await env.DB.prepare("INSERT INTO clients (owner_id,name,normalized_name,cpf,birth_date,phone,source_row,created_at,updated_at) VALUES (?,?,?,?,?,?,'PLANILHA GESTAO CLIENTES.xlsx',?,?) RETURNING id,owner_id,deleted_at").bind(ownerId,item.name,norm(item.name),cpf,item.birthDate||null,phone,now,now).first<{id:number;owner_id:string;deleted_at:number|null}>();
      clients++;
    }else{
      await env.DB.prepare("UPDATE clients SET name=?,normalized_name=?,birth_date=?,phone=?,source_row='PLANILHA GESTAO CLIENTES.xlsx',deleted_at=NULL,updated_at=? WHERE id=?").bind(item.name,norm(item.name),item.birthDate||null,phone,now,client.id).run();
      if(client.deleted_at)restored++;
    }
    if(!client)continue;
    const extra={agreement:item.agreement||'',contractType:item.contractType||'',productionIndicator:item.productionIndicator||'',adhesionFeeCents:money(item.adhesionFee),advisoryFeeCents:0,commissionRate:Number(item.commissionRate||0),commissionInstallments:1,commissionPaid:false,quotaQuantity:0,quotaUnitValueCents:0,fipeValueCents:money(item.fipeValue),dueDay:item.dueDay||'',postSale:'',postSaleNotes:''};
    const partnerId=item.partner==='GG Veículos'?gg?.id||null:null;
    const existing=await env.DB.prepare('SELECT id,deleted_at FROM operations WHERE owner_id IN (?,?) AND (dedupe_fingerprint=? OR (client_id=? AND operation_date=? AND value_cents=?)) ORDER BY CASE WHEN dedupe_fingerprint=? THEN 0 ELSE 1 END,id DESC LIMIT 1').bind(user.ownerKeys[0],user.ownerKeys[1],item.fingerprint,client.id,item.operationDate,money(item.value),item.fingerprint).first<{id:number;deleted_at:number|null}>();
    if(existing){
      await env.DB.prepare("UPDATE operations SET owner_id=?,client_id=?,partner_id=?,bank=?,promoter=?,original_product=?,category=?,producer=?,origin=?,value_cents=?,installment_cents=?,term=?,operation_date=?,paid_at=?,completed_at=?,status=?,notes=?,source_row='PLANILHA GESTAO CLIENTES.xlsx',dedupe_fingerprint=?,deleted_at=NULL,updated_at=? WHERE id=?").bind(client.owner_id,client.id,partnerId,item.bank||null,item.promoter||null,item.contractType||'Operação',item.operationType||item.contractType||'Operação',item.producer||null,item.origin||null,money(item.value),money(item.installment),Number(item.term||0),item.operationDate,item.paidAt||item.operationDate,item.paidAt||item.operationDate,item.status||'Finalizado',JSON.stringify(extra),item.fingerprint,now,existing.id).run();
      updated++;
      if(existing.deleted_at)restored++;
    }else{
      await env.DB.prepare("INSERT INTO operations (owner_id,client_id,partner_id,bank,promoter,original_product,category,producer,origin,value_cents,installment_cents,term,operation_date,paid_at,completed_at,status,notes,source_row,dedupe_fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PLANILHA GESTAO CLIENTES.xlsx',?,?,?)").bind(client.owner_id,client.id,partnerId,item.bank||null,item.promoter||null,item.contractType||'Operação',item.operationType||item.contractType||'Operação',item.producer||null,item.origin||null,money(item.value),money(item.installment),Number(item.term||0),item.operationDate,item.paidAt||item.operationDate,item.paidAt||item.operationDate,item.status||'Finalizado',JSON.stringify(extra),item.fingerprint,now,now).run();
      operations++;
    }
  }
  return json({ok:true,clients,operations,updated,restored,total:records.length});
}

export async function POST(request:Request){
  const configured=String((env as unknown as Record<string,unknown>).TF_IMPORT_TOKEN||''),provided=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
  if(!configured||provided!==configured)return json({error:'Rota indisponível.'},404);
  const body=await request.json() as {updatedSheet?:unknown;records?:Array<Record<string,unknown>>;institutions?:Array<Record<string,unknown>>;partnerRecords?:Array<Record<string,unknown>>;partnerBonus?:Record<string,unknown>},records=Array.isArray(body.records)?body.records:[],institutionRows=Array.isArray(body.institutions)?body.institutions:[],partnerRecords=Array.isArray(body.partnerRecords)?body.partnerRecords:[];
  if(body.updatedSheet){try{return json(await importUpdatedSheet(body.updatedSheet));}catch(error){console.error('Importação atualizada:',error);return json({error:error instanceof Error?error.message:'Não foi possível importar.'},400);}}
  if((!records.length&&!institutionRows.length&&!partnerRecords.length&&!body.partnerBonus)||records.length>100||institutionRows.length>200||partnerRecords.length>100)return json({error:'Lote inválido.'},400);
  const ownerId=(await ownerIdentity()).id,now=Date.now();
  let partner=await env.DB.prepare("SELECT id FROM partners WHERE owner_id=? AND lower(name)=lower('GG Veículos') AND deleted_at IS NULL LIMIT 1").bind(ownerId).first<{id:number}>();
  if(!partner)partner=await env.DB.prepare("INSERT INTO partners (owner_id,name,active,created_at,updated_at) VALUES (?,'GG Veículos',1,?,?) RETURNING id").bind(ownerId,now,now).first<{id:number}>();
  if(partnerRecords.length&&partner){
    let matched=0,created=0,adjusted=0;
    for(const item of partnerRecords){
      const name=String(item.name||'').trim(),cpf=digits(item.cpf),operationDate=String(item.operationDate||''),valueCents=money(item.value),afterIlaCents=money(item.afterIla),invoiceRate=Math.max(0,Number(item.invoiceRate||0));
      if(!name||cpf.length!==11||!/^\d{4}-\d{2}-\d{2}$/.test(operationDate))continue;
      const paidAt=/^\d{4}-\d{2}-\d{2}$/.test(String(item.paidAt||''))?String(item.paidAt):operationDate;
      let operation=await env.DB.prepare("SELECT o.id,o.owner_id,o.client_id FROM operations o JOIN clients c ON c.id=o.client_id AND c.owner_id=o.owner_id WHERE c.cpf=? AND o.deleted_at IS NULL AND (o.operation_date=? OR o.paid_at=?) ORDER BY CASE WHEN o.value_cents=? THEN 0 ELSE 1 END,o.id DESC LIMIT 1").bind(cpf,operationDate,paidAt,valueCents).first<{id:number;owner_id:string;client_id:number}>();
      let client=operation?await env.DB.prepare("SELECT id,owner_id FROM clients WHERE id=?").bind(operation.client_id).first<{id:number;owner_id:string}>():await env.DB.prepare("SELECT id,owner_id FROM clients WHERE cpf=? AND deleted_at IS NULL ORDER BY CASE WHEN owner_id=? THEN 0 ELSE 1 END LIMIT 1").bind(cpf,ownerId).first<{id:number;owner_id:string}>();
      if(!client){client=await env.DB.prepare("INSERT INTO clients (owner_id,name,normalized_name,cpf,phone,source_row,created_at,updated_at) VALUES (?,?,?,?,?,'Parceiro GG agosto-setembro 2026',?,?) RETURNING id,owner_id").bind(ownerId,name,norm(name),cpf,item.phone||null,now,now).first<{id:number;owner_id:string}>();}
      else await env.DB.prepare("UPDATE clients SET name=?,normalized_name=?,phone=COALESCE(?,phone),updated_at=? WHERE id=?").bind(name,norm(name),item.phone||null,now,client.id).run();
      if(!client)continue;
      if(!operation){
        operation=await env.DB.prepare("INSERT INTO operations (owner_id,client_id,partner_id,bank,original_product,category,producer,origin,value_cents,installment_cents,term,operation_date,paid_at,completed_at,status,source_row,dedupe_fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Parceiro GG agosto-setembro 2026',?,?,?) RETURNING id,owner_id,client_id").bind(client.owner_id,client.id,partner.id,item.bank||null,item.product||'Financiamento',item.operationType||item.product||'Financiamento',item.producer||'GG','GG Veículos',valueCents,money(item.installment),Number(item.term||0),operationDate,paidAt,paidAt,'Finalizado',`gg-${cpf}-${operationDate}-${valueCents}`,now,now).first<{id:number;owner_id:string;client_id:number}>();created++;
      }else{
        await env.DB.prepare("UPDATE operations SET partner_id=?,bank=COALESCE(?,bank),original_product=COALESCE(?,original_product),category=COALESCE(?,category),producer=COALESCE(?,producer),origin='GG Veículos',value_cents=CASE WHEN ?>0 THEN ? ELSE value_cents END,installment_cents=CASE WHEN ?>0 THEN ? ELSE installment_cents END,term=CASE WHEN ?>0 THEN ? ELSE term END,operation_date=?,paid_at=?,completed_at=COALESCE(completed_at,?),updated_at=? WHERE id=?").bind(partner.id,item.bank||null,item.product||null,item.operationType||item.product||null,item.producer||null,valueCents,valueCents,money(item.installment),money(item.installment),Number(item.term||0),Number(item.term||0),operationDate,paidAt,paidAt,now,operation.id).run();matched++;
      }
      if(!operation)continue;
      await env.DB.prepare("UPDATE commissions SET deleted_at=?,updated_at=? WHERE operation_id=? AND rate_bps IS NULL AND lower(COALESCE(notes,'')) LIKE 'base após ila parceiro gg%' AND deleted_at IS NULL").bind(now,now,operation.id).run();
      if(afterIlaCents>0)await env.DB.prepare("INSERT INTO commissions (owner_id,operation_id,rate_bps,value_cents,expected_at,received_at,status,notes,created_at,updated_at) VALUES (?,?,NULL,?,?,?,'recebida','Base após ILA parceiro GG',?,?)").bind(operation.owner_id,operation.id,afterIlaCents,operationDate,operationDate,now,now).run();
      await env.DB.prepare("INSERT INTO partner_operation_adjustments (owner_id,partner_id,operation_id,ila_rate_bps,invoice_rate_bps,tf_share_bps,created_at,updated_at) VALUES (?,?,?,2660,?,5000,?,?) ON CONFLICT(operation_id) DO UPDATE SET partner_id=excluded.partner_id,ila_rate_bps=2660,invoice_rate_bps=excluded.invoice_rate_bps,tf_share_bps=5000,updated_at=excluded.updated_at").bind(ownerId,partner.id,operation.id,Math.round(invoiceRate*100),now,now).run();adjusted++;
    }
    if(body.partnerBonus){
      const bonus=body.partnerBonus,bonusDate=String(bonus.date||''),bonusCents=money(bonus.value),anchor=await env.DB.prepare("SELECT id,owner_id FROM operations WHERE partner_id=? AND deleted_at IS NULL AND substr(operation_date,1,7)=substr(?,1,7) ORDER BY operation_date,id LIMIT 1").bind(partner.id,bonusDate).first<{id:number;owner_id:string}>();
      if(anchor&&bonusCents>0){await env.DB.prepare("UPDATE commissions SET deleted_at=?,updated_at=? WHERE operation_id=? AND rate_bps IS NULL AND lower(COALESCE(notes,'')) LIKE 'bonificação parceiro gg%' AND deleted_at IS NULL").bind(now,now,anchor.id).run();await env.DB.prepare("INSERT INTO commissions (owner_id,operation_id,rate_bps,value_cents,expected_at,received_at,status,notes,created_at,updated_at) VALUES (?,?,NULL,?,?,?,'recebida','Bonificação parceiro GG · Seguro campanha',?,?)").bind(anchor.owner_id,anchor.id,bonusCents,bonusDate,bonusDate,now,now).run();}
    }
    return json({ok:true,partnerReconciliation:{matched,created,adjusted,bonus:Boolean(body.partnerBonus)}});
  }
  let clients=0,operations=0,receivables=0,institutions=0;
  for(const item of institutionRows){const name=String(item.name||'').trim(),category=String(item.category||'Instituição').trim();if(!name)continue;const existing=await env.DB.prepare('SELECT id FROM institutions WHERE owner_id=? AND lower(name)=lower(?) AND deleted_at IS NULL LIMIT 1').bind(ownerId,name).first();if(existing)continue;await env.DB.prepare('INSERT INTO institutions (owner_id,name,category,notes,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').bind(ownerId,name,category,String(item.notes||'Base institucional TF'),now,now).run();institutions++;}
  for(const item of records){
    const name=String(item.name||'').trim(),document=digits(item.document),documentType=String(item.documentType||'CPF'),cpf=documentType==='CPF'?document||null:null,benefit=documentType==='Benefício'?document||null:null,fingerprint=String(item.fingerprint||'').trim();
    if(!name||!fingerprint)continue;
    let client=cpf?await env.DB.prepare('SELECT id FROM clients WHERE owner_id=? AND cpf=? AND deleted_at IS NULL LIMIT 1').bind(ownerId,cpf).first<{id:number}>():benefit?await env.DB.prepare('SELECT id FROM clients WHERE owner_id=? AND benefit_number=? AND deleted_at IS NULL LIMIT 1').bind(ownerId,benefit).first<{id:number}>():null;
    if(!client){client=await env.DB.prepare('INSERT INTO clients (owner_id,name,normalized_name,cpf,benefit_number,birth_date,phone,notes,source_row,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id').bind(ownerId,name,norm(name),cpf,benefit,item.birthDate||null,item.phone||null,cpf&&cpf.length!==11?'CPF informado para revisão':null,'Base agosto-setembro 2026',now,now).first<{id:number}>();clients++;}
    else await env.DB.prepare('UPDATE clients SET name=?,normalized_name=?,birth_date=COALESCE(?,birth_date),phone=COALESCE(?,phone),updated_at=? WHERE id=?').bind(name,norm(name),item.birthDate||null,item.phone||null,now,client.id).run();
    if(!client)continue;
    const existing=await env.DB.prepare('SELECT id FROM operations WHERE owner_id=? AND dedupe_fingerprint=? LIMIT 1').bind(ownerId,fingerprint).first<{id:number}>();
    if(existing)continue;
    const commissionRate=Math.max(0,Number(item.commissionRate||0)),commissionInstallments=Math.max(1,Math.min(120,Number(item.commissionInstallments||1)));
    const extra={agreement:item.agreement||'',contractType:item.contractType||item.product||'',dueDay:item.dueDay||'',productionIndicator:item.productionIndicator||'',adhesionFeeCents:money(item.adhesionFee),advisoryFeeCents:money(item.advisoryFee),commissionRate,commissionInstallments,groupQuota:item.groupQuota||'',postSale:item.postSale||'',postSaleNotes:item.postSaleNotes||''};
    const operation=await env.DB.prepare("INSERT INTO operations (owner_id,client_id,partner_id,bank,promoter,original_product,category,producer,origin,benefit_number,contract_number,value_cents,installment_cents,term,operation_date,paid_at,completed_at,status,notes,source_row,dedupe_fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id").bind(ownerId,client.id,item.partner&&partner?partner.id:null,item.bank||null,item.promoter||null,item.product||'Operação',item.operationType||item.product||'Operação',item.producer||'TF',item.origin||(item.partner?'GG Veículos':'Balcão'),benefit,item.contractNumber||null,money(item.value),money(item.installment),Number(item.term||0),item.operationDate||null,item.paidAt||item.operationDate||null,item.operationDate||new Date().toISOString().slice(0,10),item.status||'Finalizado',JSON.stringify(extra),'Base agosto-setembro 2026',fingerprint,now,now).first<{id:number}>();
    if(!operation)continue;operations++;
    const adhesionCents=money(item.adhesionFee);
    if(adhesionCents>0){await env.DB.prepare("INSERT INTO commissions (owner_id,operation_id,value_cents,expected_at,status,notes,created_at,updated_at) VALUES (?,?,?,?,'prevista','Taxa de adesão',?,?)").bind(ownerId,operation.id,adhesionCents,item.revenueDueDate||item.operationDate||null,now,now).run();receivables++;}
    const commissionCents=Math.round(money(item.value)*commissionRate/100),firstDue=String(item.revenueDueDate||item.operationDate||'');
    if(commissionCents>0){const base=Math.floor(commissionCents/commissionInstallments),remainder=commissionCents-base*commissionInstallments;for(let index=0;index<commissionInstallments;index++){const amount=base+(index<remainder?1:0);await env.DB.prepare("INSERT INTO commissions (owner_id,operation_id,rate_bps,value_cents,expected_at,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,'prevista',?,?,?)").bind(ownerId,operation.id,Math.round(commissionRate*100),amount,firstDue?addMonths(firstDue,index):null,`Comissão ${index+1}/${commissionInstallments}`,now,now).run();receivables++;}}
  }
  return json({ok:true,clients,operations,receivables,institutions});
}

export async function PATCH(request:Request){
  const user=await getTfAccess();if(!user||(!hasTfPermission(user,'clientes')&&!hasTfPermission(user,'producao')))return json({error:'Não autorizado'},401);
  const body=await request.json() as {entity?:string;id?:number;details?:Record<string,unknown>},id=Number(body.id),d=body.details||{},now=Date.now();
  if(!id)return json({error:'Registro inválido.'},400);
  if(user.role==='employee'){
    const field=user.partnerId?'partner_id':'assigned_user_id',scope=user.partnerId||user.memberId;
    const entityFilter=body.entity==='client'?'o.client_id=?':body.entity==='operation'?'o.id=?':body.entity==='commission'?'o.id=(SELECT operation_id FROM commissions WHERE id=?)':null;
    if(!entityFilter)return json({error:'Tipo de registro inválido.'},400);
    const allowed=await env.DB.prepare(`SELECT o.id FROM operations o WHERE ${entityFilter} AND o.owner_id IN (?,?) AND o.${field}=? AND o.deleted_at IS NULL LIMIT 1`).bind(id,user.ownerKeys[0],user.ownerKeys[1],scope).first();
    if(!allowed)return json({error:'Registro não encontrado.'},404);
  }

  if(body.entity==='client'){
    const owned=await env.DB.prepare('SELECT id FROM clients WHERE id=? AND owner_id IN (?,?) AND deleted_at IS NULL').bind(id,user.ownerKeys[0],user.ownerKeys[1]).first();if(!owned)return json({error:'Cliente não encontrado.'},404);
    const name=String(d.name||'').trim(),document=digits(d.document),cpf=document.length===11?document:null,benefit=document.length===11?null:document||null;if(!name)return json({error:'Informe o nome.'},400);
    await env.DB.prepare('UPDATE clients SET name=?,normalized_name=?,cpf=?,benefit_number=?,birth_date=?,phone=?,updated_at=? WHERE id=?').bind(name,norm(name),cpf,benefit,d.birthDate||null,d.phone||null,now,id).run();return json({ok:true});
  }
  if(body.entity==='operation'){
    const owned=await env.DB.prepare('SELECT id,notes FROM operations WHERE id=? AND owner_id IN (?,?) AND deleted_at IS NULL').bind(id,user.ownerKeys[0],user.ownerKeys[1]).first<{id:number;notes:string}>();if(!owned)return json({error:'Operação não encontrada.'},404);
    const currentNotes=notes(owned.notes),extra={...currentNotes,agreement:d.agreement||'',contractType:d.contractType||d.product||'',dueDay:d.dueDay||'',productionIndicator:d.productionIndicator||'',adhesionFeeCents:money(d.adhesionFee),advisoryFeeCents:money(d.advisoryFee),bonusCents:money(d.bonus),commissionRate:Number(String(d.commissionRate||0).replace(',','.')),commissionInstallments:Number(d.commissionInstallments||1),commissionPaid:d.commissionPaid==='Sim',quotaQuantity:Number(d.quotaQuantity||0),quotaUnitValueCents:money(d.quotaUnitValue),fipeValueCents:money(d.fipeValue),postSale:d.postSale||'',postSaleNotes:d.postSaleNotes||''};
    const hasRevenue=money(d.adhesionFee)>0||money(d.advisoryFee)>0||money(d.bonus)>0||Number(String(d.commissionRate||0).replace(',','.'))>0;if(hasRevenue&&d.commissionPaid!=='Sim'&&!String(d.revenueDueDate||'').trim())return json({error:'Informe o vencimento da receita.'},400);
    let partnerId:number|null=null,origin=productionSources.includes(String(d.producer))?(hasGgCode(String(d.producer))?'GG Veículos':'TF'):(String(d.origin||'TF').trim()||'TF');
    if(!['Balcão','TF'].includes(origin)){
      let partner=await env.DB.prepare('SELECT id FROM partners WHERE owner_id IN (?,?) AND lower(name)=lower(?) AND deleted_at IS NULL LIMIT 1').bind(user.ownerKeys[0],user.ownerKeys[1],origin).first<{id:number}>();
      if(!partner)partner=await env.DB.prepare('INSERT INTO partners (owner_id,name,active,created_at,updated_at) VALUES (?,?,1,?,?) RETURNING id').bind(user.ownerKey,origin,now,now).first<{id:number}>();
      partnerId=partner?.id||null;
    }
    await env.DB.prepare('UPDATE operations SET partner_id=?,bank=?,original_product=?,category=?,producer=?,origin=?,value_cents=?,installment_cents=?,term=?,operation_date=?,paid_at=?,status=?,notes=?,updated_at=? WHERE id=?').bind(partnerId,d.bank||null,d.product||'Operação',d.operationType||d.product||'Operação',d.producer||'TF',origin,money(d.value),money(d.installment),Number(d.term||0),d.operationDate||null,d.paidAt||null,d.status||'Finalizado',JSON.stringify(extra),now,id).run();
    await env.DB.prepare('UPDATE commissions SET deleted_at=?,updated_at=? WHERE operation_id=? AND owner_id IN (?,?) AND deleted_at IS NULL').bind(now,now,id,user.ownerKeys[0],user.ownerKeys[1]).run();
    const due=String(d.revenueDueDate||d.operationDate||''),rate=Number(String(d.commissionRate||0).replace(',','.')),commission=rate>0?Math.round(money(d.value)*rate/100):0;
    const commissionInstallments=/consórcio/i.test(String(d.product||''))?Math.max(1,Math.min(120,Number(d.commissionInstallments||1))):1;
    if(commission>0){const basePart=Math.floor(commission/commissionInstallments),remainder=commission-basePart*commissionInstallments,status=d.commissionPaid==='Sim'?'recebida':'prevista';for(let index=0;index<commissionInstallments;index++){const expected=due?addMonths(due,index):null;await env.DB.prepare("INSERT INTO commissions (owner_id,operation_id,rate_bps,value_cents,expected_at,received_at,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(user.ownerKey,id,Math.round(rate*100),basePart+(index===0?remainder:0),expected,status==='recebida'?expected:null,status,commissionInstallments>1?`Comissão · Parcela ${index+1}/${commissionInstallments}`:'Comissão',now,now).run();}}
    for(const [label,value] of [['Taxa de adesão',money(d.adhesionFee)],['Taxa de assessoria',money(d.advisoryFee)],['Bonificação',money(d.bonus)]] as Array<[string,number]>)if(value>0){const status=d.commissionPaid==='Sim'?'recebida':'prevista';await env.DB.prepare("INSERT INTO commissions (owner_id,operation_id,value_cents,expected_at,received_at,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(user.ownerKey,id,value,due||null,status==='recebida'?(due||new Date().toISOString().slice(0,10)):null,status,label,now,now).run();}
    return json({ok:true});
  }
  if(body.entity==='commission'){
    const owned=await env.DB.prepare('SELECT id FROM commissions WHERE id=? AND owner_id IN (?,?) AND deleted_at IS NULL').bind(id,user.ownerKeys[0],user.ownerKeys[1]).first();if(!owned)return json({error:'Crédito não encontrado.'},404);
    const status=d.status==='recebida'?'recebida':'prevista',receivedAt=status==='recebida'?new Date().toISOString().slice(0,10):null;await env.DB.prepare('UPDATE commissions SET status=?,received_at=?,updated_at=? WHERE id=?').bind(status,receivedAt,now,id).run();return json({ok:true,status});
  }
  return json({error:'Tipo de registro inválido.'},400);
}

export async function DELETE(request:Request){
  const user=await getTfAccess();if(!user||user.role!=='admin')return json({error:'Não autorizado'},401);
  const url=new URL(request.url),entity=url.searchParams.get('entity'),id=Number(url.searchParams.get('id')),now=Date.now();if(!id)return json({error:'Registro inválido.'},400);
  if(entity==='operation'){const owned=await env.DB.prepare('SELECT id FROM operations WHERE id=? AND owner_id IN (?,?) AND deleted_at IS NULL').bind(id,user.ownerKeys[0],user.ownerKeys[1]).first();if(!owned)return json({error:'Operação não encontrada.'},404);await env.DB.batch([env.DB.prepare('UPDATE operations SET deleted_at=?,updated_at=? WHERE id=?').bind(now,now,id),env.DB.prepare('UPDATE commissions SET deleted_at=?,updated_at=? WHERE operation_id=? AND deleted_at IS NULL').bind(now,now,id)]);return json({ok:true});}
  if(entity==='client'){
    const owned=await env.DB.prepare('SELECT id FROM clients WHERE id=? AND owner_id IN (?,?) AND deleted_at IS NULL').bind(id,user.ownerKeys[0],user.ownerKeys[1]).first();if(!owned)return json({error:'Cliente não encontrado.'},404);
    const files=await env.DB.prepare("SELECT file_key FROM client_documents WHERE client_id=? AND owner_id IN (?,?) UNION SELECT dd.file_key FROM deal_documents dd JOIN deals d ON d.id=dd.deal_id WHERE d.client_id=? AND d.owner_id IN (?,?)").bind(id,user.ownerKeys[0],user.ownerKeys[1],id,user.ownerKeys[0],user.ownerKeys[1]).all<{file_key:string}>();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM partner_operation_adjustments WHERE operation_id IN (SELECT id FROM operations WHERE client_id=? AND owner_id IN (?,?))').bind(id,user.ownerKeys[0],user.ownerKeys[1]),
      env.DB.prepare('UPDATE invoices SET deleted_at=?,updated_at=? WHERE client_id=? AND owner_id IN (?,?) AND deleted_at IS NULL').bind(now,now,id,user.ownerKeys[0],user.ownerKeys[1]),
      env.DB.prepare('UPDATE commissions SET deleted_at=?,updated_at=? WHERE operation_id IN (SELECT id FROM operations WHERE client_id=? AND owner_id IN (?,?)) AND deleted_at IS NULL').bind(now,now,id,user.ownerKeys[0],user.ownerKeys[1]),
      env.DB.prepare('DELETE FROM deal_documents WHERE deal_id IN (SELECT id FROM deals WHERE client_id=? AND owner_id IN (?,?))').bind(id,user.ownerKeys[0],user.ownerKeys[1]),
      env.DB.prepare('DELETE FROM deal_history WHERE deal_id IN (SELECT id FROM deals WHERE client_id=? AND owner_id IN (?,?))').bind(id,user.ownerKeys[0],user.ownerKeys[1]),
      env.DB.prepare('DELETE FROM deals WHERE client_id=? AND owner_id IN (?,?)').bind(id,user.ownerKeys[0],user.ownerKeys[1]),
      env.DB.prepare('UPDATE operations SET deleted_at=?,updated_at=? WHERE client_id=? AND owner_id IN (?,?) AND deleted_at IS NULL').bind(now,now,id,user.ownerKeys[0],user.ownerKeys[1]),
      env.DB.prepare('DELETE FROM client_documents WHERE client_id=? AND owner_id IN (?,?)').bind(id,user.ownerKeys[0],user.ownerKeys[1]),
      env.DB.prepare('UPDATE clients SET deleted_at=?,updated_at=? WHERE id=?').bind(now,now,id)
    ]);
    const keys=Array.from(new Set(files.results.map(item=>item.file_key).filter(Boolean)));if(keys.length)try{await env.FILES.delete(keys)}catch{}
    return json({ok:true});
  }
  return json({error:'Tipo de registro inválido.'},400);
}
