import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateOperationRecord} from '../lib/update-operation.ts';
import {closeDeal} from '../lib/close-deal.ts';

const access={ownerKeys:['owner','owner'],role:'admin',memberId:null,partnerId:null};
function operationDatabase(){
  const row:any={id:7,owner_id:'owner',client_id:3,partner_id:null,value_cents:4265000,installment_cents:0,notes:JSON.stringify({commissionRate:3.75}),original_product:'Financiamento',operation_date:'2026-10-16',commissions:[{id:42,rate_bps:375,value_cents:159938,status:'recebida',notes:'Comissão',received_at:'2026-10-01',expected_at:'2026-10-01'}]};
  const client={query:async(sql:string,values:any[]=[])=>{
    if(sql.startsWith('SELECT'))return {rows:[row],rowCount:1};
    if(sql.startsWith('UPDATE operations SET ')){const fields=sql.split(' SET ')[1].split(' WHERE ')[0].split(',').map(x=>x.split('=')[0]);fields.forEach((f,i)=>row[f]=values[i]);}
    else if(sql.startsWith('UPDATE commissions SET ')){const [value_cents,rate_bps,expected_at,received_at,status]=values;Object.assign(row.commissions[0],{value_cents,rate_bps,expected_at,received_at,status});}
    else throw new Error(sql);
    return {rows:[],rowCount:1};
  }};
  return {row,db:{transaction:async(fn:any)=>fn(client)} as any};
}
test('saving fixed commission updates existing receipt and survives unrelated edits',async()=>{
  const {row,db}=operationDatabase();
  let result=await updateOperationRecord(db,access,7,{commissionAmount:'R$ 469,38'});
  assert.equal(result.commission,469.38);assert.equal(result.commissionReceived,469.38);
  assert.equal(JSON.parse(row.notes).commissionAmountCents,46938);
  assert.equal(row.commissions[0].id,42);assert.equal(row.commissions[0].received_at,'2026-10-01');assert.equal(row.commissions[0].rate_bps,null);
  result=await updateOperationRecord(db,access,7,{bank:'BV',value:50000});assert.equal(result.commission,469.38);
  result=await updateOperationRecord(db,access,7,{commissionAmount:0});assert.equal(result.commission,0);assert.equal(result.commissionAmount,0);
  result=await updateOperationRecord(db,access,7,{commissionAmount:'',commissionRate:3.6});assert.equal(result.commission,1800);assert.equal(result.commissionAmount,null);assert.equal(row.commissions[0].rate_bps,360);
});
test('negative commission cannot change saved money',async()=>{const {row,db}=operationDatabase();await assert.rejects(()=>updateOperationRecord(db,access,7,{commissionAmount:-2}));assert.equal(row.commissions[0].value_cents,159938);});

test('closing keeps client and original operation and records why',async()=>{
  const queries:{sql:string;values:any[]}[]=[];
  const row={id:5,owner_id:'owner',client_id:3,operation_id:7,stage:'analise',status:'aberto',payload_json:JSON.stringify({name:'CLIENTE',history:[{type:'criacao'}]})};
  const db:any={transaction:async(fn:any)=>fn({query:async(sql:string,values:any[])=>{queries.push({sql,values});return {rows:sql.startsWith('SELECT * FROM deals')?[row]:sql.startsWith('SELECT notes')?[{notes:JSON.stringify({observations:'Original'}),completed_at:null,is_historical:0}]:[],rowCount:1}}})};
  await closeDeal(db,access,5,'Cliente desistiu','Preferiu aguardar.');
  assert.equal(queries.some(q=>/DELETE|UPDATE clients|deleted_at=|completed_at=/.test(q.sql)),false);
  const saved=queries.find(q=>q.sql.startsWith('UPDATE deals'))!;const payload=JSON.parse(saved.values[0]);
  assert.equal(payload.name,'CLIENTE');assert.equal(payload.history.length,2);assert.equal(payload.closureReason,'Cliente desistiu');
  const op=queries.find(q=>q.sql.startsWith('UPDATE operations'))!;assert.equal(JSON.parse(op.values[0]).observations,'Original');
  assert.ok(queries.find(q=>q.sql.startsWith('INSERT INTO deal_history')));
});
test('closing rejects another employee and completed operations',async()=>{
  const db:any={transaction:async(fn:any)=>fn({query:async(sql:string)=>({rows:sql.includes('FROM deals')?[{owner_id:'owner',assigned_user_id:8,status:'aberto',stage:'analise',operation_id:7}]:[{completed_at:'2026-10-16'}]})})};
  await assert.rejects(()=>closeDeal(db,{...access,role:'employee',memberId:9},5,'Cliente desistiu',''));
  await assert.rejects(()=>closeDeal(db,access,5,'Cliente desistiu',''));
  await assert.rejects(()=>closeDeal(db,access,5,'Inválido',''));
});
