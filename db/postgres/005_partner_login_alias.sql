ALTER TABLE users ADD COLUMN IF NOT EXISTS login text;
ALTER TABLE access_users ADD COLUMN IF NOT EXISTS login text;

CREATE UNIQUE INDEX IF NOT EXISTS users_login_unique ON users (lower(login)) WHERE login IS NOT NULL AND login <> '';
CREATE UNIQUE INDEX IF NOT EXISTS access_users_owner_login_unique ON access_users (owner_id,lower(login)) WHERE login IS NOT NULL AND login <> '';
