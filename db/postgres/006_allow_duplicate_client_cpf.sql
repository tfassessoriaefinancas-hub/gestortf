DROP INDEX IF EXISTS clients_owner_cpf_unique;
CREATE INDEX IF NOT EXISTS idx_clients_owner_cpf ON clients (owner_id,cpf);

UPDATE deals SET stage='assinatura' WHERE stage='fechamento';
UPDATE deals SET stage='finalizado' WHERE stage='contratado';
UPDATE operations SET status='assinatura' WHERE status='fechamento';
UPDATE operations SET status='finalizado' WHERE status='contratado';
