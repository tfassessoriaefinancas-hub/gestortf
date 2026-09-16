CREATE TABLE `users` (`id` text PRIMARY KEY NOT NULL,`email` text NOT NULL,`name` text,`role` text DEFAULT 'admin' NOT NULL,`active` integer DEFAULT true NOT NULL,`created_at` integer NOT NULL,`updated_at` integer NOT NULL,`deleted_at` integer);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `clients` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`owner_id` text NOT NULL,`name` text NOT NULL,`normalized_name` text NOT NULL,`cpf` text,`benefit_number` text,`birth_date` text,`phone` text,`email` text,`address` text,`city` text,`notes` text,`source_row` text,`created_at` integer NOT NULL,`updated_at` integer NOT NULL,`deleted_at` integer);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_owner_cpf_unique` ON `clients` (`owner_id`,`cpf`);
--> statement-breakpoint
CREATE INDEX `idx_clients_owner_name` ON `clients` (`owner_id`,`normalized_name`);
--> statement-breakpoint
CREATE INDEX `idx_clients_owner_benefit` ON `clients` (`owner_id`,`benefit_number`);
--> statement-breakpoint
CREATE INDEX `idx_clients_owner_phone` ON `clients` (`owner_id`,`phone`);
--> statement-breakpoint
CREATE TABLE `partners` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`owner_id` text NOT NULL,`name` text NOT NULL,`trade_name` text,`document` text,`phone` text,`whatsapp` text,`email` text,`address` text,`contact_name` text,`partnership_type` text,`started_at` text,`notes` text,`active` integer DEFAULT true NOT NULL,`created_at` integer NOT NULL,`updated_at` integer NOT NULL,`deleted_at` integer);
--> statement-breakpoint
CREATE TABLE `services` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`owner_id` text NOT NULL,`name` text NOT NULL,`category` text,`description` text,`price_cents` integer DEFAULT 0,`advisory_fee_cents` integer DEFAULT 0,`commission_rate_bps` integer DEFAULT 0,`institution` text,`notes` text,`active` integer DEFAULT true NOT NULL,`created_at` integer NOT NULL,`updated_at` integer NOT NULL,`deleted_at` integer);
--> statement-breakpoint
CREATE TABLE `operations` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`owner_id` text NOT NULL,`client_id` integer NOT NULL,`partner_id` integer,`service_id` integer,`bank` text,`promoter` text,`original_product` text,`category` text,`producer` text,`origin` text,`location` text,`benefit_number` text,`contract_number` text,`value_cents` integer DEFAULT 0,`installment_cents` integer DEFAULT 0,`term` integer,`operation_date` text,`paid_at` text,`completed_at` text,`status` text DEFAULT 'novo_cliente' NOT NULL,`notes` text,`source_row` text,`dedupe_fingerprint` text,`created_at` integer NOT NULL,`updated_at` integer NOT NULL,`deleted_at` integer,FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`),FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`),FOREIGN KEY (`service_id`) REFERENCES `services`(`id`));
--> statement-breakpoint
CREATE INDEX `idx_operations_owner_client_date` ON `operations` (`owner_id`,`client_id`,`operation_date`);
--> statement-breakpoint
CREATE INDEX `idx_operations_dedupe` ON `operations` (`owner_id`,`dedupe_fingerprint`);
--> statement-breakpoint
CREATE TABLE `commissions` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`owner_id` text NOT NULL,`operation_id` integer NOT NULL,`rate_bps` integer,`value_cents` integer DEFAULT 0 NOT NULL,`expected_at` text,`received_at` text,`status` text DEFAULT 'prevista' NOT NULL,`notes` text,`created_at` integer NOT NULL,`updated_at` integer NOT NULL,`deleted_at` integer,FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`));
--> statement-breakpoint
CREATE TABLE `invoices` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`owner_id` text NOT NULL,`number` text NOT NULL,`client_id` integer,`partner_id` integer,`service_id` integer,`value_cents` integer NOT NULL,`issued_at` text,`paid_at` text,`status` text DEFAULT 'pendente' NOT NULL,`file_key` text,`file_name` text,`notes` text,`created_at` integer NOT NULL,`updated_at` integer NOT NULL,`deleted_at` integer);
--> statement-breakpoint
CREATE TABLE `institutions` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`owner_id` text NOT NULL,`name` text NOT NULL,`category` text,`url` text,`logo_key` text,`notes` text,`active` integer DEFAULT true NOT NULL,`created_at` integer NOT NULL,`updated_at` integer NOT NULL,`deleted_at` integer);
--> statement-breakpoint
CREATE TABLE `import_batches` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`owner_id` text NOT NULL,`file_name` text NOT NULL,`backup_key` text,`row_count` integer DEFAULT 0 NOT NULL,`unique_clients` integer DEFAULT 0 NOT NULL,`merged_clients` integer DEFAULT 0 NOT NULL,`preserved_operations` integer DEFAULT 0 NOT NULL,`possible_duplicates` integer DEFAULT 0 NOT NULL,`missing_cpf` integer DEFAULT 0 NOT NULL,`inconsistencies` integer DEFAULT 0 NOT NULL,`status` text DEFAULT 'analisando' NOT NULL,`created_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `audit_log` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`owner_id` text NOT NULL,`user_id` text,`entity_type` text NOT NULL,`entity_id` text NOT NULL,`action` text NOT NULL,`before_json` text,`after_json` text,`created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_audit_owner_entity` ON `audit_log` (`owner_id`,`entity_type`,`entity_id`);
--> statement-breakpoint
PRAGMA optimize;
