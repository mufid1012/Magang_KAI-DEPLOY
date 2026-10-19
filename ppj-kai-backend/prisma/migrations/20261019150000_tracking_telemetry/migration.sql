ALTER TABLE `tracking`
  ADD COLUMN `telemetry_state` JSON NULL,
  ADD COLUMN `telemetry_test` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `telemetry_loss` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `position_accuracy` DOUBLE NULL,
  ADD COLUMN `position_captured_at` DATETIME(3) NULL;

CREATE TABLE `tracking_samples` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tracking_id` INTEGER NOT NULL,
  `sample_id` VARCHAR(80) NOT NULL,
  `captured_at` DATETIME(3) NOT NULL,
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `latitude` DOUBLE NOT NULL, `longitude` DOUBLE NOT NULL, `accuracy` DOUBLE NOT NULL,
  `device_speed` DOUBLE NULL, `quality` VARCHAR(30) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tracking_samples_tracking_id_sample_id_key` (`tracking_id`, `sample_id`),
  UNIQUE INDEX `tracking_samples_tracking_id_captured_at_key` (`tracking_id`, `captured_at`),
  CONSTRAINT `tracking_samples_tracking_id_fkey` FOREIGN KEY (`tracking_id`) REFERENCES `tracking` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `speed_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `tracking_id` INTEGER NOT NULL,
  `start_at` DATETIME(3) NOT NULL, `end_at` DATETIME(3) NOT NULL,
  `duration_ms` INTEGER NOT NULL, `max_kmh` DOUBLE NOT NULL, `mean_kmh` DOUBLE NOT NULL,
  `sample_count` INTEGER NOT NULL, `worst_accuracy` DOUBLE NOT NULL, `is_test` BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `speed_events_tracking_id_start_at_key` (`tracking_id`, `start_at`),
  CONSTRAINT `speed_events_tracking_id_fkey` FOREIGN KEY (`tracking_id`) REFERENCES `tracking` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
