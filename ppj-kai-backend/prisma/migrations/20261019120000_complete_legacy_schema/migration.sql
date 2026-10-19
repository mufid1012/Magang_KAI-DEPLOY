-- Complete the historical base schema; idempotent for installations provisioned with db push.

-- No rows/tables are dropped. Existing columns are checked before being added.

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'jabatan') = 0, 'ALTER TABLE `users` ADD COLUMN `jabatan` VARCHAR(100) NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'division') = 0, 'ALTER TABLE `users` ADD COLUMN `division` VARCHAR(100) NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'work_area') = 0, 'ALTER TABLE `users` ADD COLUMN `work_area` VARCHAR(100) NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone') = 0, 'ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(30) NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'alert_sound') = 0, 'ALTER TABLE `users` ADD COLUMN `alert_sound` VARCHAR(20) NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active') = 0, 'ALTER TABLE `users` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'manager_id') = 0, 'ALTER TABLE `users` ADD COLUMN `manager_id` INTEGER NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tugas_ppj' AND COLUMN_NAME = 'jam_mulai') = 0, 'ALTER TABLE `tugas_ppj` ADD COLUMN `jam_mulai` VARCHAR(10) NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tugas_ppj' AND COLUMN_NAME = 'jam_selesai') = 0, 'ALTER TABLE `tugas_ppj` ADD COLUMN `jam_selesai` VARCHAR(10) NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking' AND COLUMN_NAME = 'foto_awal') = 0, 'ALTER TABLE `tracking` ADD COLUMN `foto_awal` LONGTEXT NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking' AND COLUMN_NAME = 'foto_selesai') = 0, 'ALTER TABLE `tracking` ADD COLUMN `foto_selesai` LONGTEXT NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking' AND COLUMN_NAME = 'route_path') = 0, 'ALTER TABLE `tracking` ADD COLUMN `route_path` LONGTEXT NULL', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

ALTER TABLE `users` MODIFY `foto` TEXT NULL, ALTER `role` SET DEFAULT 'ppj';

UPDATE `users` SET `role` = 'ppj' WHERE `role` = 'petugas';

ALTER TABLE `laporan` MODIFY `foto` LONGTEXT NULL, MODIFY `jenis_temuan` VARCHAR(50) NOT NULL;

CREATE TABLE IF NOT EXISTS `wilayah` (
 `id` INTEGER NOT NULL AUTO_INCREMENT, `kode` VARCHAR(20) NOT NULL, `nama` VARCHAR(100) NOT NULL, `stations` TEXT NOT NULL,
 UNIQUE INDEX `wilayah_kode_key` (`kode`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_wilayah` (
 `id` INTEGER NOT NULL AUTO_INCREMENT, `user_id` INTEGER NOT NULL, `wilayah_id` INTEGER NOT NULL,
 UNIQUE INDEX `user_wilayah_user_id_wilayah_id_key` (`user_id`,`wilayah_id`), PRIMARY KEY (`id`),
 CONSTRAINT `user_wilayah_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `user_wilayah_wilayah_id_fkey` FOREIGN KEY (`wilayah_id`) REFERENCES `wilayah` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kategori_temuan` (
 `id` INTEGER NOT NULL AUTO_INCREMENT, `key` VARCHAR(50) NOT NULL, `label` VARCHAR(100) NOT NULL, `icon` VARCHAR(50) NOT NULL,
 `color` VARCHAR(20) NOT NULL DEFAULT 'primary', `is_active` BOOLEAN NOT NULL DEFAULT true, `sort_order` INTEGER NOT NULL DEFAULT 0,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE INDEX `kategori_temuan_key_key` (`key`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `template_penugasan` (
 `id` INTEGER NOT NULL AUTO_INCREMENT, `nama` VARCHAR(100) NOT NULL, `created_by` INTEGER NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL, PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `template_item` (
 `id` INTEGER NOT NULL AUTO_INCREMENT, `template_id` INTEGER NOT NULL, `assigned_to` INTEGER NOT NULL,
 `start_point_name` VARCHAR(200) NOT NULL, `end_point_name` VARCHAR(200) NOT NULL,
 `start_point_lat` DOUBLE NOT NULL, `start_point_long` DOUBLE NOT NULL, `end_point_lat` DOUBLE NOT NULL, `end_point_long` DOUBLE NOT NULL,
 `jam_mulai` VARCHAR(10) NULL, `jam_selesai` VARCHAR(10) NULL, PRIMARY KEY (`id`),
 CONSTRAINT `template_item_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `template_penugasan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'users_manager_id_fkey') = 0, 'ALTER TABLE `users` ADD CONSTRAINT `users_manager_id_fkey` FOREIGN KEY (`manager_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');

PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;

-- Prisma owns updatedAt values on writes. Match the generated model without a server default.
ALTER TABLE `login_photos` MODIFY `updated_at` DATETIME(3) NOT NULL;
