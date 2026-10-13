CREATE TABLE `warning_recipients` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `warning_id` INTEGER NOT NULL,
  `tracking_id` INTEGER NOT NULL,
  UNIQUE INDEX `warning_recipients_warning_id_tracking_id_key` (`warning_id`, `tracking_id`),
  INDEX `warning_recipients_tracking_id_idx` (`tracking_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `warning_recipients_warning_id_fkey` FOREIGN KEY (`warning_id`) REFERENCES `warning_alerts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `warning_recipients_tracking_id_fkey` FOREIGN KEY (`tracking_id`) REFERENCES `tracking` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve old recipients; ignore orphaned sessions and duplicate legacy slots.
INSERT INTO `warning_recipients` (`warning_id`, `tracking_id`)
SELECT w.`id`, w.`recipient_one_tracking_id`
FROM `warning_alerts` w INNER JOIN `tracking` t ON t.`id` = w.`recipient_one_tracking_id`;

INSERT INTO `warning_recipients` (`warning_id`, `tracking_id`)
SELECT w.`id`, w.`recipient_two_tracking_id`
FROM `warning_alerts` w INNER JOIN `tracking` t ON t.`id` = w.`recipient_two_tracking_id`
WHERE w.`recipient_one_tracking_id` IS NULL OR w.`recipient_two_tracking_id` <> w.`recipient_one_tracking_id`;

ALTER TABLE `warning_alerts`
  DROP COLUMN `recipient_one_tracking_id`,
  DROP COLUMN `recipient_two_tracking_id`;
