CREATE TABLE `access_users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_id` text NOT NULL,
  `email` text NOT NULL,
  `name` text NOT NULL,
  `permissions_json` text DEFAULT '["inicio","atendimento"]' NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX `access_users_owner_email_unique` ON `access_users` (`owner_id`,`email`);
CREATE INDEX `idx_access_users_email_active` ON `access_users` (`email`,`active`);
ALTER TABLE `deals` ADD `assigned_user_id` integer REFERENCES `access_users`(`id`);
ALTER TABLE `operations` ADD `assigned_user_id` integer REFERENCES `access_users`(`id`);
CREATE INDEX `idx_deals_owner_assignee_stage` ON `deals` (`owner_id`,`assigned_user_id`,`stage`);
CREATE INDEX `idx_operations_owner_assignee` ON `operations` (`owner_id`,`assigned_user_id`);
PRAGMA optimize;
