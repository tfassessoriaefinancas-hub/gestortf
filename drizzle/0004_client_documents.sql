CREATE TABLE IF NOT EXISTS client_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'outro',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_documents_owner_client ON client_documents(owner_id, client_id);
