#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { applyMigrations, loadMigrations } from './migrations.mjs'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')
const migrationsDir = path.join(repoRoot, 'migrations')

if (process.env.MYSQL_ISOLATED_SCHEMA_VALIDATE !== '1') {
  console.log('isolated mysql: skipped; set MYSQL_ISOLATED_SCHEMA_VALIDATE=1 to run.')
  process.exit(0)
}

const required = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']
const missing = required.filter((name) => !process.env[name])
if (missing.length > 0) {
  console.error(`isolated mysql: missing ${missing.join(', ')}`)
  process.exit(1)
}

if (process.env.MYSQL_ALLOW_SCHEMA_RESET !== '1') {
  console.error('isolated mysql: refusing to reset schema without MYSQL_ALLOW_SCHEMA_RESET=1')
  process.exit(1)
}

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  multipleStatements: false,
})

try {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0')
  await connection.query('DROP TABLE IF EXISTS `certificate_thumbnails`')
  await connection.query('DROP TABLE IF EXISTS `certificates`')
  await connection.query('DROP TABLE IF EXISTS `schema_migrations`')
  await connection.query('SET FOREIGN_KEY_CHECKS = 1')

  const migrations = await loadMigrations(migrationsDir)
  const firstRun = await applyMigrations(connection, migrations, {
    databaseName: process.env.MYSQL_DATABASE,
  })
  const secondRun = await applyMigrations(connection, migrations, {
    databaseName: process.env.MYSQL_DATABASE,
  })
  if (firstRun.appliedCount !== migrations.length || secondRun.appliedCount !== 0) {
    throw new Error('isolated mysql: migration ledger idempotency check failed')
  }

  await assertTables()
  await assertSyntheticWorkflow()
  console.log(`isolated mysql: applied ${migrations.length} migration file(s) and passed synthetic schema smoke.`)
} finally {
  await connection.end()
}

async function assertTables() {
  const [rows] = await connection.query(
    [
      'SELECT TABLE_NAME',
      'FROM INFORMATION_SCHEMA.TABLES',
      'WHERE TABLE_SCHEMA = DATABASE()',
      'AND TABLE_NAME IN (?, ?, ?)',
      'ORDER BY TABLE_NAME',
    ].join(' '),
    ['certificate_thumbnails', 'certificates', 'schema_migrations']
  )
  const names = rows.map((row) => row.TABLE_NAME)
  if (names.join(',') !== 'certificate_thumbnails,certificates,schema_migrations') {
    throw new Error(`isolated mysql: missing expected tables, found ${names.join(',') || 'none'}`)
  }
}

async function assertSyntheticWorkflow() {
  const [insertResult] = await connection.execute(
    [
      'INSERT INTO `certificates`',
      '(`appwrite_document_id`, `CERTIFICATE_NO`, `PRODUCT_NAME`, `CATEGORY`, `r2_object_key`)',
      'VALUES (?, ?, ?, ?, ?)',
    ].join(' '),
    ['synthetic-doc-1', 'SYN-001', 'Synthetic Product', 'Synthetic Category', 'certificates/syn-001.jpg']
  )

  await connection.execute(
    [
      'INSERT INTO `certificate_thumbnails`',
      '(`certificate_id`, `thumbnail_blob`, `thumbnail_mime`, `thumbnail_width`,',
      '`thumbnail_height`, `thumbnail_size_bytes`, `thumbnail_sha256`)',
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
    ].join(' '),
    [
      insertResult.insertId,
      Buffer.from('synthetic-thumbnail'),
      'image/jpeg',
      1,
      1,
      Buffer.byteLength('synthetic-thumbnail'),
      '0'.repeat(64),
    ]
  )

  const [joined] = await connection.execute(
    [
      'SELECT `certificates`.`CERTIFICATE_NO`, `certificate_thumbnails`.`certificate_id`',
      'FROM `certificates`',
      'LEFT JOIN `certificate_thumbnails`',
      'ON `certificate_thumbnails`.`certificate_id` = `certificates`.`id`',
      'WHERE `certificates`.`id` = ?',
    ].join(' '),
    [insertResult.insertId]
  )
  if (joined[0]?.CERTIFICATE_NO !== 'SYN-001' || joined[0]?.certificate_id !== insertResult.insertId) {
    throw new Error('isolated mysql: synthetic certificate/thumbnail join failed')
  }

  try {
    await connection.execute(
      [
        'INSERT INTO `certificates`',
        '(`appwrite_document_id`, `CERTIFICATE_NO`)',
        'VALUES (?, ?)',
      ].join(' '),
      ['synthetic-doc-1', 'SYN-002']
    )
    throw new Error('isolated mysql: duplicate appwrite_document_id unexpectedly succeeded')
  } catch (error) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error
  }

  await connection.execute('DELETE FROM `certificates` WHERE `id` = ?', [insertResult.insertId])
  const [thumbnailRows] = await connection.execute(
    'SELECT COUNT(*) AS `total` FROM `certificate_thumbnails` WHERE `certificate_id` = ?',
    [insertResult.insertId]
  )
  if (Number(thumbnailRows[0]?.total || 0) !== 0) {
    throw new Error('isolated mysql: thumbnail cascade delete failed')
  }
}
