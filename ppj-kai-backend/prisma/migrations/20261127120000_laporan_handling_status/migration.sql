-- Additive: status penanganan laporan temuan oleh pengelola (admin/KUPT). Data lama menjadi 'baru'.
ALTER TABLE `laporan`
  ADD COLUMN `handling_status` VARCHAR(20) NOT NULL DEFAULT 'baru',
  ADD COLUMN `handled_by` INTEGER NULL,
  ADD COLUMN `handled_at` DATETIME(3) NULL,
  ADD COLUMN `handling_note` VARCHAR(500) NULL;

CREATE INDEX `laporan_handling_status_idx` ON `laporan`(`handling_status`);

ALTER TABLE `laporan` ADD CONSTRAINT `laporan_handled_by_fkey` FOREIGN KEY (`handled_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
