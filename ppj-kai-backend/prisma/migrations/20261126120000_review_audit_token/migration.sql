-- Additive: token revocation, rejected/early-stopped inspection results, and an admin audit log.
ALTER TABLE `users` ADD COLUMN `token_version` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `tracking`
  ADD COLUMN `rejected_by` INTEGER NULL,
  ADD COLUMN `rejected_at` DATETIME(3) NULL,
  ADD COLUMN `rejection_reason` VARCHAR(500) NULL,
  ADD COLUMN `early_stop_reason` VARCHAR(500) NULL;

ALTER TABLE `tracking` ADD CONSTRAINT `tracking_rejected_by_fkey` FOREIGN KEY (`rejected_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `admin_audit_log` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `actor_id` INTEGER NULL,
  `action` VARCHAR(50) NOT NULL,
  `target_type` VARCHAR(30) NOT NULL,
  `target_id` INTEGER NOT NULL,
  `detail` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `admin_audit_log_created_at_idx`(`created_at`),
  INDEX `admin_audit_log_target_type_target_id_idx`(`target_type`, `target_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `admin_audit_log` ADD CONSTRAINT `admin_audit_log_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
