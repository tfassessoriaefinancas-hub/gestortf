ALTER TABLE access_users ADD COLUMN partner_id INTEGER REFERENCES partners(id);
