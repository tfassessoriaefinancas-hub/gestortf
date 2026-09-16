import { hashPassword } from '@/lib/password';
import type { PoolClient } from 'pg';
import type { PostgresStatement } from '@/lib/postgres';
import { env } from '@/lib/runtime';
import { getTfOwner, TF_PERMISSIONS, type TfPermission } from '../../chatgpt-auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const normalizePermissions=(value:unknown):TfPermission[]=>{
  const source=Array.isArray(value)?value.map(String):[];
  const permissions=TF_PERMISSIONS.filter((permission)=>source.includes(permission));
  if(!permissions.includes('inicio'))permissions.unshift('inicio');
  return permissions;
};
const mapMember=(row:any)=>({
  id:Number(row.id),name:String(row.name||''),email:String(row.email||''),
  active:Boolean(row.active),partnerId:row.partner_id?Number(row.partner_id):null,partnerName:String(row.partner_name||''),permissions:normalizePermissions((()=>{try{return JSON.parse(row.permissions_json||'[]')}catch{return []}})()),
});

export async function GET(){
  const owner=await getTfOwner();if(!owner)return json({error:'Não autorizado'},401);
  const rows=await env.DB.prepare('SELECT au.id,au.name,au.email,au.permissions_json,au.active,au.partner_id,p.name partner_name FROM access_users au LEFT JOIN partners p ON p.id=au.partner_id WHERE au.owner_id=? ORDER BY au.active DESC,lower(au.name)').bind(owner.ownerKey).all();
  return json({members:rows.results.map(mapMember),permissionOptions:TF_PERMISSIONS});
}

export async function POST(request:Request){
  const owner=await getTfOwner();if(!owner)return json({error:'Não autorizado'},401);
  const body=await request.json() as Record<string,unknown>;
  const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase();
  if(!name||!/^\S+@\S+\.\S+$/.test(email))return json({error:'Informe nome e e-mail válidos.'},400);
  if(email===owner.email.toLowerCase())return json({error:'O administrador não pode ser alterado como subacesso.'},400);
  const password=String(body.password||'');
  if(password.length<8||password.length>256)return json({error:'Defina uma senha entre 8 e 256 caracteres.'},400);
  const partnerId=body.partnerId?Number(body.partnerId):null,permissions=partnerId?normalizePermissions(['inicio','parceiros','relatorios']):normalizePermissions(body.permissions),now=Date.now();
  try{
    const row=await persistMember(env.DB.prepare("INSERT INTO access_users (owner_id,name,email,permissions_json,partner_id,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(owner_id,email) DO UPDATE SET name=excluded.name,permissions_json=excluded.permissions_json,partner_id=excluded.partner_id,active=1,updated_at=excluded.updated_at RETURNING id,name,email,permissions_json,partner_id,active").bind(owner.ownerKey,name,email,JSON.stringify(permissions),partnerId,now,now),password);
    return json({member:mapMember(row)},201);
  }catch{return json({error:'Não foi possível salvar este acesso.'},500)}
}

export async function PATCH(request:Request){
  const owner=await getTfOwner();if(!owner)return json({error:'Não autorizado'},401);
  const body=await request.json() as Record<string,unknown>,id=Number(body.id);
  if(!id)return json({error:'Usuário inválido.'},400);
  const current=await env.DB.prepare('SELECT * FROM access_users WHERE id=? AND owner_id=?').bind(id,owner.ownerKey).first<any>();
  if(!current)return json({error:'Usuário não encontrado.'},404);
  const name=String(body.name??current.name).trim(),email=String(body.email??current.email).trim().toLowerCase();
  const permissions=body.permissions===undefined?normalizePermissions(JSON.parse(current.permissions_json||'[]')):normalizePermissions(body.permissions);
  const active=body.active===undefined?Boolean(current.active):Boolean(body.active);
  const partnerId=body.partnerId===undefined?(current.partner_id||null):(body.partnerId?Number(body.partnerId):null);
  if(!name||!/^\S+@\S+\.\S+$/.test(email))return json({error:'Informe nome e e-mail válidos.'},400);
  if(email===owner.email.toLowerCase())return json({error:'O administrador não pode ser alterado como subacesso.'},400);
  const password=String(body.password||'');
  if(password&&(password.length<8||password.length>256))return json({error:'Use uma senha entre 8 e 256 caracteres.'},400);
  const account=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(`member:${id}`).first();
  if(active&&!account&&!password)return json({error:'Defina uma senha para ativar o acesso deste usuário.'},400);
  try{
    const row=await persistMember(env.DB.prepare('UPDATE access_users SET name=?,email=?,permissions_json=?,partner_id=?,active=?,updated_at=? WHERE id=? AND owner_id=? RETURNING id,name,email,permissions_json,partner_id,active').bind(name,email,JSON.stringify(partnerId?normalizePermissions(['inicio','parceiros','relatorios']):permissions),partnerId,active?1:0,Date.now(),id,owner.ownerKey),password);
    return json({member:mapMember(row)});
  }catch{return json({error:'Não foi possível atualizar este acesso.'},500)}
}

async function persistMember(statement: PostgresStatement, password: string) {
  return env.DB.transaction(async client => {
    const row=(await statement.execute(client)).results[0];
    await syncMemberAccount(client,mapMember(row),password);
    return row;
  });
}

async function syncMemberAccount(client: PoolClient, member: ReturnType<typeof mapMember>, password: string) {
  const id = `member:${member.id}`, now = Date.now();
  const statements = [env.DB.prepare(`INSERT INTO users (id,email,name,role,active,created_at,updated_at)
    VALUES (?,?,?,'employee',?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,active=excluded.active,updated_at=excluded.updated_at`)
    .bind(id, member.email, member.name, member.active ? 1 : 0, now, now)];
  if(password) statements.push(env.DB.prepare(`INSERT INTO auth_credentials (user_id,password_hash,updated_at) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at`).bind(id, await hashPassword(password), now));
  if(password || !member.active) statements.push(env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(id));
  for(const statement of statements)await statement.execute(client);
}
