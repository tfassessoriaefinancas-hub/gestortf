export function localIdentity(host: string | null) {
  if (process.env.LOCAL_AUTH_ENABLED !== 'true' || !host) return null;
  let hostname: string;
  try { hostname = new URL(`http://${host}`).hostname; } catch { return null; }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return null;
  const email = process.env.LOCAL_USER_EMAIL || 'admin@example.com';
  const fullName = process.env.LOCAL_USER_NAME || 'Administrador';
  return { userId: process.env.LOCAL_USER_ID || email, email, displayName: fullName, fullName };
}
