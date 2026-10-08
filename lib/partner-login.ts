import type { loginIdentifier } from './login-identifier';

// The historical GG import used the display name as its login. Keep that
// existing account usable without changing its password or partner binding.
export function legacyPartnerLoginQuery(identifier: ReturnType<typeof loginIdentifier>, partnerAccess: boolean) {
  if (!partnerAccess || identifier?.kind !== 'login' || identifier.value !== 'ggveiculos') return null;
  return {
    sql: `SELECT u.id,c.password_hash FROM users u
      JOIN auth_credentials c ON c.user_id=u.id
      WHERE lower(u.login)=lower(?) AND u.active=1 AND u.deleted_at IS NULL
        AND u.id LIKE 'member:%'`,
    bindings: ['GG VEÍCULOS'],
  };
}
