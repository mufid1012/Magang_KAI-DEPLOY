-- Additive: tanda tangan online PPJ (saat selesai) dan penyetuju (saat approval), PNG data URL.
ALTER TABLE `tracking` ADD COLUMN `ttd_petugas` LONGTEXT NULL, ADD COLUMN `ttd_approver` LONGTEXT NULL;
