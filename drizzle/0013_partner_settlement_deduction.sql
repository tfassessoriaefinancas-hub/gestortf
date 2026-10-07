ALTER TABLE partner_settlements ADD COLUMN deduction_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE partner_settlements ADD COLUMN deduction_description TEXT;

PRAGMA optimize;
