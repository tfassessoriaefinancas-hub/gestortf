ALTER TABLE partner_settlements
  ADD COLUMN bonus_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN bonus_description text;
