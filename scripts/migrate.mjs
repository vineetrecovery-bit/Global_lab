#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { applyMigrations, loadMigrations } from './migrations.mjs'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')
const migrationsDir = path.join(repoRoot, 'migrations')
const required = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']
const missing = required.filter((name) => !process.env[name])

if (missing.length > 0) {
  console.error(`database migration: missing ${missing.join(', ')}`)
  process.exit(1)
}

const lockTimeoutSeconds = Number(process.env.MYSQL_MIGRATION_LOCK_TIMEOUT_SECONDS || 60)
if (!Number.isInteger(lockTimeoutSeconds) || lockTimeoutSeconds < 0) {
  console.error('database migration: MYSQL_MIGRATION_LOCK_TIMEOUT_SECONDS must be a non-negative integer')
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
  const migrations = await loadMigrations(migrationsDir)
  const result = await applyMigrations(connection, migrations, {
    databaseName: process.env.MYSQL_DATABASE,
    lockTimeoutSeconds,
  })
  console.log(`database migration: ${result.appliedCount} applied, ${result.totalCount} tracked`)
} finally {
  await connection.end()
}
