ALTER TABLE `deals` ADD `lead_score` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `deals` ADD `source` text;
--> statement-breakpoint
ALTER TABLE `deals` ADD `probability` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `deals` ADD `recurring_value_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `products` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `owner_id` text NOT NULL, `name` text NOT NULL, `price_cents` integer NOT NULL, `active` integer DEFAULT true NOT NULL);
--> statement-breakpoint
CREATE TABLE `proposals` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `owner_id` text NOT NULL, `deal_id` integer, `status` text DEFAULT 'draft' NOT NULL, `total_cents` integer NOT NULL, `viewed_at` integer, `accepted_at` integer, FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action);
--> statement-breakpoint
CREATE TABLE `automations` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `owner_id` text NOT NULL, `name` text NOT NULL, `trigger_type` text NOT NULL, `action_type` text NOT NULL, `active` integer DEFAULT true NOT NULL);
