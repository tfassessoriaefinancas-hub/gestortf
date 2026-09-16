CREATE TABLE partner_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  owner_id TEXT NOT NULL,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  period TEXT NOT NULL,
  gross_commission_cents INTEGER NOT NULL DEFAULT 0,
  fee_rate_bps INTEGER NOT NULL DEFAULT 201,
  tf_share_bps INTEGER NOT NULL DEFAULT 5000,
  status TEXT NOT NULL DEFAULT 'em_aberto',
  paid_at TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX partner_settlements_partner_period_unique
ON partner_settlements(partner_id, period);

CREATE INDEX idx_partner_settlements_owner_period
ON partner_settlements(owner_id, period);

PRAGMA optimize;
