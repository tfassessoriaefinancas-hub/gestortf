ALTER TABLE partner_settlements
  ADD COLUMN deduction_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN deduction_description text;
