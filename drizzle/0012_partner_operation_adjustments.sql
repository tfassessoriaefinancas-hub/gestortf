CREATE TABLE partner_operation_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  owner_id TEXT NOT NULL,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  operation_id INTEGER NOT NULL REFERENCES operations(id),
  ila_rate_bps INTEGER NOT NULL DEFAULT 0,
  invoice_rate_bps INTEGER NOT NULL DEFAULT 201,
  tf_share_bps INTEGER NOT NULL DEFAULT 5000,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX partner_operation_adjustments_operation_unique
ON partner_operation_adjustments(operation_id);

CREATE INDEX idx_partner_operation_adjustments_owner_partner
ON partner_operation_adjustments(owner_id, partner_id);

PRAGMA optimize;
