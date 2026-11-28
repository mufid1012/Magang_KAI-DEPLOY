-- Additive: hubungkan warning ke sesi tracking pengirim agar QC dapat melihat tugas asalnya.
ALTER TABLE `warning_alerts` ADD COLUMN `tracking_id` INTEGER NULL;
CREATE INDEX `warning_alerts_tracking_id_idx` ON `warning_alerts`(`tracking_id`);
ALTER TABLE `warning_alerts` ADD CONSTRAINT `warning_alerts_tracking_id_fkey` FOREIGN KEY (`tracking_id`) REFERENCES `tracking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
