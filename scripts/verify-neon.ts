import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PostgresDatabase, quoteIdentifier } from '../lib/postgres.ts';

process.loadEnvFile('.env.local');
const plan=JSON.parse(readFileSync(resolve(process.env.LOCAL_DATA_DIR||'data','neon-migration-plan.json'),'utf8'));
const db=new PostgresDatabase();
try {
  await db.transaction(async client=>{
    let records=0;
    for(const [table,expected] of Object.entries(plan.tables) as [string,Record<string,unknown>[]][]){
      const actual=(await client.query(`SELECT * FROM ${quoteIdentifier(table)}`)).rows;
      if(actual.length!==expected.length)throw new Error(`Contagem divergente: ${table}`);
      const byId=new Map(actual.map(row=>[row.id??row.message_id,row]));
      for(const row of expected){
        const value=byId.get(row.id??row.message_id);
        if(!value || !Object.entries(row).every(([key,item])=>isDeepStrictEqual(value[key],item)))throw new Error(`Conteúdo divergente: ${table}`);
      }
      records+=actual.length;
    }
    const sources=(await client.query('SELECT source,source_id,entity_type,entity_id,payload FROM source_records')).rows;
    const byKey=new Map(sources.map(row=>[`${row.source}:${row.source_id}`,row]));
    if(sources.length!==plan.sources.length)throw new Error('Contagem de fontes divergente.');
    for(const expected of plan.sources){
      // Optional relational metadata is stored as NULL; the original JSON payload is compared exactly.
      if(!isDeepStrictEqual(byKey.get(`${expected.source}:${expected.source_id}`),{entity_type:null,entity_id:null,...expected}))throw new Error('Conteúdo de fonte divergente.');
    }
    const orphans=await client.query('SELECT COUNT(*) AS count FROM operations o LEFT JOIN clients c ON c.id=o.client_id WHERE c.id IS NULL');
    if(orphans.rows[0].count)throw new Error('Relacionamento inválido.');
    console.log(JSON.stringify({verified:true,canonicalRecords:records,archivedSourceRecords:sources.length,clients:plan.tables.clients.length,operations:plan.tables.operations.length,commissions:plan.tables.commissions.length,orphanOperations:0}));
  });
}catch(error){console.error('Verificação falhou:',(error as {code?:string}).code||(error as Error).message);process.exitCode=1;}
finally{await db.close();}
