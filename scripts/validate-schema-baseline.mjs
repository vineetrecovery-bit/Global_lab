#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIGRATION_FILE_PATTERN } from './migrations.mjs'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')
const migrationsDir = path.join(repoRoot, 'migrations')

const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith('.sql'))
  .sort()

const errors = []

if (files.length === 0) {
  errors.push('No numbered SQL migrations found.')
}

files.forEach((file, index) => {
  if (!MIGRATION_FILE_PATTERN.test(file)) {
    errors.push(`Invalid migration filename: ${file}.`)
  }
  const expectedPrefix = String(index + 1).padStart(3, '0')
  if (!file.startsWith(`${expectedPrefix}_`)) {
    errors.push(`Migration order gap: expected ${expectedPrefix}_..., found ${file}.`)
  }
})

const baseline = files.find((file) => file === '001_schema_baseline.sql')
if (!baseline) {
  errors.push('Missing 001_schema_baseline.sql.')
} else {
  const sql = await readFile(path.join(migrationsDir, baseline), 'utf8')
  const requiredSnippets = [
    'CREATE TABLE IF NOT EXISTS `certificates`',
    '`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
    '`CERTIFICATE_NO` VARCHAR(64) NOT NULL',
    '`r2_object_key` VARCHAR(255) NULL',
    'UNIQUE KEY `uniq_appwrite_document_id` (`appwrite_document_id`)',
    'KEY `idx_certificate_no` (`CERTIFICATE_NO`)',
    'CREATE TABLE IF NOT EXISTS `certificate_thumbnails`',
    '`thumbnail_blob` MEDIUMBLOB NOT NULL',
    'PRIMARY KEY (`certificate_id`)',
    'ON DELETE CASCADE',
    'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ]

  for (const snippet of requiredSnippets) {
    if (!sql.includes(snippet)) {
      errors.push(`Baseline schema missing: ${snippet}`)
    }
  }

  if (/INSERT\s+INTO/i.test(sql)) {
    errors.push('Baseline schema must not contain data INSERT statements.')
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`schema baseline: ${error}`)
  }
  process.exit(1)
}

console.log(`Validated ${files.length} migration file(s).`)
