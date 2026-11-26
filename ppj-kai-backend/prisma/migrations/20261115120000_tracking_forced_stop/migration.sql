-- Additive: records who ended a tracking session on the PPJ's behalf, when, and why.
ALTER TABLE `tracking`
  ADD COLUMN `forced_stop_by` INTEGER NULL,
  ADD COLUMN `forced_stop_at` DATETIME(3) NULL,
  ADD COLUMN `forced_stop_reason` VARCHAR(500) NULL;

ALTER TABLE `tracking` ADD CONSTRAINT `tracking_forced_stop_by_fkey` FOREIGN KEY (`forced_stop_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
