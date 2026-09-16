ALTER TABLE `deals` ADD `client_id` integer REFERENCES `clients`(`id`);
--> statement-breakpoint
ALTER TABLE `deals` ADD `operation_id` integer REFERENCES `operations`(`id`);
--> statement-breakpoint
ALTER TABLE `deals` ADD `payload_json` text;
--> statement-breakpoint
ALTER TABLE `deals` ADD `created_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `deals` ADD `needs_completion` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX `idx_deals_owner_client` ON `deals` (`owner_id`,`client_id`);
--> statement-breakpoint
CREATE INDEX `idx_deals_owner_operation` ON `deals` (`owner_id`,`operation_id`);
--> statement-breakpoint
ALTER TABLE `operations` ADD `vehicle_plate` text;
--> statement-breakpoint
ALTER TABLE `operations` ADD `vehicle_name` text;
--> statement-breakpoint
ALTER TABLE `operations` ADD `vehicle_model` text;
--> statement-breakpoint
ALTER TABLE `operations` ADD `vehicle_year` integer;
--> statement-breakpoint
ALTER TABLE `operations` ADD `vehicle_value_cents` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `operations` ADD `financed_value_cents` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `operations` ADD `down_payment_cents` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `operations` ADD `desired_credit_cents` integer DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `deal_history` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_id` text NOT NULL,
  `deal_id` integer NOT NULL REFERENCES `deals`(`id`),
  `operation_id` integer REFERENCES `operations`(`id`),
  `event_type` text NOT NULL,
  `description` text NOT NULL,
  `before_json` text,
  `after_json` text,
  `source` text NOT NULL DEFAULT 'Gestão TF',
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_deal_history_owner_deal` ON `deal_history` (`owner_id`,`deal_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `whatsapp_integrations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_id` text NOT NULL,
  `admin_phone` text NOT NULL,
  `phone_number_id` text NOT NULL,
  `display_phone` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_integrations_owner_unique` ON `whatsapp_integrations` (`owner_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_integrations_phone_number_id_unique` ON `whatsapp_integrations` (`phone_number_id`);
--> statement-breakpoint
CREATE TABLE `whatsapp_messages` (
  `message_id` text PRIMARY KEY NOT NULL,
  `owner_id` text,
  `from_phone` text NOT NULL,
  `message_type` text NOT NULL,
  `command_text` text,
  `status` text NOT NULL,
  `error_text` text,
  `received_at` integer NOT NULL,
  `processed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_whatsapp_messages_owner_received` ON `whatsapp_messages` (`owner_id`,`received_at`);
--> statement-breakpoint
CREATE TABLE `whatsapp_pending_actions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_id` text NOT NULL,
  `from_phone` text NOT NULL,
  `kind` text NOT NULL,
  `payload_json` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pendente',
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_whatsapp_pending_owner_phone` ON `whatsapp_pending_actions` (`owner_id`,`from_phone`,`status`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `gestor_tf_audit` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_id` text NOT NULL,
  `actor_role` text NOT NULL,
  `whatsapp_phone` text NOT NULL,
  `message_id` text,
  `command_text` text NOT NULL,
  `action` text NOT NULL,
  `client_id` integer REFERENCES `clients`(`id`),
  `operation_id` integer REFERENCES `operations`(`id`),
  `deal_id` integer REFERENCES `deals`(`id`),
  `before_json` text,
  `after_json` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_gestor_tf_audit_owner_created` ON `gestor_tf_audit` (`owner_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
