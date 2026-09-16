CREATE TABLE IF NOT EXISTS `deals` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`owner_id` text NOT NULL,`company_id` integer,`title` text NOT NULL,`value_cents` integer DEFAULT 0,`stage` text NOT NULL,`status` text NOT NULL,`expected_close_at` text,`updated_at` integer NOT NULL,`lead_score` integer,`source` text,`probability` integer,`recurring_value_cents` integer);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_deals_owner_stage` ON `deals` (`owner_id`,`stage`);
--> statement-breakpoint
