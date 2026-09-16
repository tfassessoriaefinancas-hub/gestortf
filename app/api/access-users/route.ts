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
  const rows=await env.DB.prepare('SELECT au.id,au.name,au.email,au.permissions_json,au.active,au.partner_id,p.name partner_name FROM access_users au LEFT JOIN partners p ON p.id=au.partner_id WHERE au.owner_id=? ORDER BY au.active DESC,au.name COLLATE NOCASE').bind(owner.ownerKey).all();
  return json({members:rows.results.map(mapMember),permissionOptions:TF_PERMISSIONS});
}

export async function POST(request:Request){
  const owner=await getTfOwner();if(!owner)return json({error:'Não autorizado'},401);
  const body=await request.json() as Record<string,unknown>;
  const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase();
  if(!name||!/^\S+@\S+\.\S+$/.test(email))return json({error:'Informe nome e e-mail válidos.'},400);
  const partnerId=body.partnerId?Number(body.partnerId):null,permissions=partnerId?normalizePermissions(['inicio','parceiros','relatorios']):normalizePermissions(body.permissions),now=Date.now();
  try{
    const row=await env.DB.prepare("INSERT INTO access_users (owner_id,name,email,permissions_json,partner_id,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(owner_id,email) DO UPDATE SET name=excluded.name,permissions_json=excluded.permissions_json,partner_id=excluded.partner_id,active=1,updated_at=excluded.updated_at RETURNING id,name,email,permissions_json,partner_id,active").bind(owner.ownerKey,name,email,JSON.stringify(permissions),partnerId,now,now).first();
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
  try{
    const row=await env.DB.prepare('UPDATE access_users SET name=?,email=?,permissions_json=?,partner_id=?,active=?,updated_at=? WHERE id=? AND owner_id=? RETURNING id,name,email,permissions_json,partner_id,active').bind(name,email,JSON.stringify(partnerId?normalizePermissions(['inicio','parceiros','relatorios']):permissions),partnerId,active?1:0,Date.now(),id,owner.ownerKey).first();
    return json({member:mapMember(row)});
  }catch{return json({error:'Não foi possível atualizar este acesso.'},500)}
}
