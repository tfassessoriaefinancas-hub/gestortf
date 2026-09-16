CREATE TABLE `companies` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_id` text NOT NULL,
  `name` text NOT NULL,
  `segment` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `company_id` integer,
  `name` text NOT NULL,
  `email` text,
  `phone` text,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deals` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_id` text NOT NULL,
  `company_id` integer,
  `title` text NOT NULL,
  `value_cents` integer DEFAULT 0 NOT NULL,
  `stage` text NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `expected_close_at` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `activities` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_id` text NOT NULL,
  `deal_id` integer,
  `type` text NOT NULL,
  `title` text NOT NULL,
  `due_at` integer,
  `completed_at` integer,
  FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_companies_owner_id` ON `companies` (`owner_id`);
--> statement-breakpoint
CREATE INDEX `idx_deals_owner_stage` ON `deals` (`owner_id`,`stage`);
--> statement-breakpoint
CREATE INDEX `idx_activities_owner_due` ON `activities` (`owner_id`,`due_at`);
