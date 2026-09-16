CREATE INDEX idx_commissions_operation_active ON commissions (operation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_owner_page ON clients (owner_id,updated_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_operations_owner_page ON operations (owner_id,updated_at DESC,id DESC) WHERE deleted_at IS NULL AND report_excluded=0;
CREATE INDEX idx_users_login_email ON users (lower(email)) WHERE active=1 AND deleted_at IS NULL;
