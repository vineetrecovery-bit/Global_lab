-- Global Lab sanitized MySQL schema baseline.
-- Generated from the reviewed Appwrite-to-MySQL migration shape, without data,
-- secrets, provider object contents, or private certificate rows.

CREATE TABLE IF NOT EXISTS `certificates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `appwrite_document_id` VARCHAR(64) NOT NULL,
  `CERTIFICATE_NO` VARCHAR(64) NOT NULL,
  `Certificate_photograph` VARCHAR(255) NULL,
  `PRODUCT_NAME` VARCHAR(64) NULL,
  `CATEGORY` VARCHAR(64) NULL,
  `r2_object_key` VARCHAR(255) NULL,
  `appwrite_created_at` DATETIME(3) NULL,
  `appwrite_updated_at` DATETIME(3) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_appwrite_document_id` (`appwrite_document_id`),
  KEY `idx_certificate_no` (`CERTIFICATE_NO`),
  KEY `idx_category` (`CATEGORY`),
  KEY `idx_product_name` (`PRODUCT_NAME`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `certificate_thumbnails` (
  `certificate_id` BIGINT UNSIGNED NOT NULL,
  `thumbnail_blob` MEDIUMBLOB NOT NULL,
  `thumbnail_mime` VARCHAR(50) NOT NULL,
  `thumbnail_width` SMALLINT UNSIGNED NOT NULL,
  `thumbnail_height` SMALLINT UNSIGNED NOT NULL,
  `thumbnail_size_bytes` INT UNSIGNED NOT NULL,
  `thumbnail_sha256` CHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`certificate_id`),
  KEY `idx_thumbnail_sha256` (`thumbnail_sha256`),
  CONSTRAINT `fk_certificate_thumbnails_certificate` FOREIGN KEY (`certificate_id`) REFERENCES `certificates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
