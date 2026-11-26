-- Additive: catatan QC per tugas.
CREATE TABLE `qc_notes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tugas_id` INTEGER NOT NULL,
  `author_id` INTEGER NULL,
  `note` VARCHAR(500) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `qc_notes_tugas_id_idx`(`tugas_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `qc_notes` ADD CONSTRAINT `qc_notes_tugas_id_fkey` FOREIGN KEY (`tugas_id`) REFERENCES `tugas_ppj`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `qc_notes` ADD CONSTRAINT `qc_notes_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
