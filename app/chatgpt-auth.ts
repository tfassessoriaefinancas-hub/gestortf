import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/runtime';
import { localIdentity } from '@/lib/local-identity';
import { getSessionUser, ownerIdentity } from '@/lib/auth-session';

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  role?: 'admin' | 'employee';
  serverAuthenticated?: boolean;
};

export const TF_PERMISSIONS = [
  'inicio','clientes','atendimento','producao','parceiros','servicos',
  'comissoes','financeiro','notas','bancos','relatorios','posvenda',
] as const;
export type TfPermission = (typeof TF_PERMISSIONS)[number];
export type TfAccess = ChatGPTUser & {
  ownerKey: string;
  ownerKeys: string[];
  role: 'admin' | 'employee';
  memberId: number | null;
  partnerId: number | null;
  permissions: TfPermission[];
};

export async function getTfOwner(): Promise<(ChatGPTUser & { ownerKey: string }) | null> {
  const user = await getChatGPTUser();
  if (!user || (user.role !== 'admin' && user.serverAuthenticated)) return null;
  return { ...user, ownerKey: user.userId };
}

export async function getTfAccess(existingUser?: ChatGPTUser | null): Promise<TfAccess | null> {
  const user = existingUser === undefined ? await getChatGPTUser() : existingUser;
  if (!user) return null;
  const email = user.email.trim().toLowerCase();
  if (user.role === 'admin' || !user.serverAuthenticated)
    return { ...user, ownerKey: user.userId, ownerKeys: [user.userId, email], role: 'admin', memberId: null, partnerId:null, permissions: [...TF_PERMISSIONS] };
  const owner = await ownerIdentity();
  const member = await env.DB.prepare(
    'SELECT id,owner_id,partner_id,permissions_json FROM access_users WHERE lower(email)=? AND owner_id IN (?,?) AND active=1 LIMIT 1',
  ).bind(email,owner.id,owner.email).first<{id:number;owner_id:string;partner_id:number|null;permissions_json:string}>();
  if (!member) return null;
  let permissions: TfPermission[] = ['inicio'];
  try {
    const parsed = JSON.parse(member.permissions_json || '[]');
    if (Array.isArray(parsed)) permissions = TF_PERMISSIONS.filter((p) => parsed.includes(p));
  } catch {}
  if (!permissions.includes('inicio')) permissions.unshift('inicio');
  return { ...user, ownerKey: member.owner_id, ownerKeys: [owner.id, owner.email], role: 'employee', memberId: member.id, partnerId:member.partner_id||null, permissions };
}

export const hasTfPermission = (access: TfAccess, permission: TfPermission) =>
  access.role === 'admin' || access.permissions.includes(permission);

const SIGN_IN_PATH = '/signin-with-chatgpt';
const SIGN_OUT_PATH = '/signout-with-chatgpt';
const CALLBACK_PATH = '/callback';

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const sessionUser = await getSessionUser();
  if (sessionUser) return sessionUser;
  const requestHeaders = await headers();
  // The original identity headers were injected by the Sites gateway. A native
  // Next server must never trust those headers from the incoming browser.
  return localIdentity(requestHeaders.get('host'));
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';

  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local') return '/';
  if (isReservedAuthPath(url.pathname)) return '/';

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}
