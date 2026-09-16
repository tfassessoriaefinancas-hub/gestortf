import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PostgresDatabase } from '../lib/postgres.ts';
import { hashPassword, verifyPassword } from '../lib/password.ts';
import { loginIdentifier } from '../lib/login-identifier.ts';

try { process.loadEnvFile('.env.local'); } catch { /* Environment may already be configured. */ }
const directory = resolve(process.env.LOCAL_DATA_DIR || 'data');
const input = JSON.parse(readFileSync(resolve(directory, 'admin-access-update.json'), 'utf8'));
const identifier = loginIdentifier(input.login);
// This administrative reset accepts the password explicitly chosen by the owner.
if (!identifier || identifier.kind !== 'cpf' || typeof input.password !== 'string' || !input.password || input.password.length > 256) throw new Error('Informe CPF e senha no arquivo privado de atualização.');
const db = new PostgresDatabase();
try {
  const passwordHash = await hashPassword(input.password);
  const account = await db.transaction(async client => {
    const result = await client.query("SELECT u.id,u.email FROM users u JOIN app_settings s ON s.key='owner_id' AND s.value=u.id WHERE u.role='admin' AND u.active=1 AND u.deleted_at IS NULL FOR UPDATE OF u");
    if (result.rows.length !== 1) throw new Error('Administrador não encontrado.');
    const owner = result.rows[0], now = Date.now();
    await client.query('UPDATE users SET cpf=$1,updated_at=$2 WHERE id=$3', [identifier.value, now, owner.id]);
    await client.query('INSERT INTO auth_credentials (user_id,password_hash,updated_at) VALUES ($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at', [owner.id, passwordHash, now]);
    await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [owner.id]);
    const keys = [`login:account:${owner.id}`, `login:cpf:${identifier.value}`, `login:email:${owner.email}`, `login:${owner.email}`].map(value => createHash('sha256').update(value).digest('hex'));
    await client.query('DELETE FROM auth_attempts WHERE key=ANY($1::text[])', [keys]);
    return owner;
  });
  const saved = await db.prepare('SELECT u.cpf,c.password_hash FROM users u JOIN auth_credentials c ON c.user_id=u.id WHERE u.id=?').bind(account.id).first<{ cpf: string; password_hash: string }>();
  if (saved?.cpf !== identifier.value || !await verifyPassword(input.password, saved.password_hash)) throw new Error('Falha ao conferir o acesso atualizado.');
  writeFileSync(resolve(directory, 'neon-access.json'), JSON.stringify({ login: identifier.value, email: account.email, password: input.password, instructions: 'Entre com CPF ou e-mail e a senha definida pelo administrador.' }, null, 2), { mode: 0o600 });
  console.log('CPF e senha do administrador atualizados e conferidos no PostgreSQL.');
} catch (error) {
  console.error('Falha ao atualizar o acesso:', (error as { code?: string }).code || (error as Error).message);
  process.exitCode = 1;
} finally { await db.close(); }
