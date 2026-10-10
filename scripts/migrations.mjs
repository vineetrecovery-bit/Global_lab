import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export const MIGRATION_FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/

export async function loadMigrations(migrationsDir) {
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith('.sql'))
    .sort()

  if (filenames.length === 0) throw new Error('No SQL migrations found.')

  filenames.forEach((filename, index) => {
    if (!MIGRATION_FILE_PATTERN.test(filename)) {
      throw new Error(`Invalid migration filename: ${filename}`)
    }
    const expectedPrefix = String(index + 1).padStart(3, '0')
    if (!filename.startsWith(`${expectedPrefix}_`)) {
      throw new Error(`Migration order gap: expected ${expectedPrefix}_..., found ${filename}.`)
    }
  })

  return Promise.all(filenames.map(async (filename) => {
    const sql = await readFile(path.join(migrationsDir, filename), 'utf8')
    const statements = splitSqlStatements(sql)
    if (statements.length === 0) {
      throw new Error(`Migration contains no SQL statements: ${filename}`)
    }
    return {
      filename,
      checksum: createHash('sha256').update(sql).digest('hex'),
      statements,
    }
  }))
}

export async function applyMigrations(connection, migrations, options = {}) {
  const logger = options.logger || console
  const databaseName = options.databaseName || 'default'
  const lockTimeoutSeconds = options.lockTimeoutSeconds ?? 60
  const lockName = migrationLockName(databaseName)
  let lockAcquired = false

  try {
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, ?) AS `acquired`', [
      lockName,
      lockTimeoutSeconds,
    ])
    lockAcquired = Number(lockRows[0]?.acquired) === 1
    if (!lockAcquired) {
      throw new Error(`Could not acquire migration lock within ${lockTimeoutSeconds} seconds.`)
    }

    await ensureMigrationTable(connection)
    const applied = await readAppliedMigrations(connection)
    assertMigrationHistory(migrations, applied)

    let appliedCount = 0
    for (const migration of migrations) {
      if (applied.has(migration.filename)) continue

      const startedAt = Date.now()
      logger.log(`database migration: applying ${migration.filename}`)
      for (const statement of migration.statements) await connection.query(statement)
      if (migration.filename === '001_schema_baseline.sql') {
        await assertBaselineSchema(connection)
      }
      const executionMs = Date.now() - startedAt

      await connection.execute(
        [
          'INSERT INTO `schema_migrations`',
          '(`filename`, `checksum_sha256`, `execution_ms`)',
          'VALUES (?, ?, ?)',
        ].join(' '),
        [migration.filename, migration.checksum, executionMs]
      )
      appliedCount += 1
      logger.log(`database migration: applied ${migration.filename} (${executionMs} ms)`)
    }

    if (appliedCount === 0) logger.log('database migration: schema is current')
    return { appliedCount, totalCount: migrations.length }
  } finally {
    if (lockAcquired) {
      await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch((error) => {
        logger.error('database migration: failed to release advisory lock', error)
      })
    }
  }
}

export function splitSqlStatements(sql) {
  if (/^\s*DELIMITER\b/im.test(sql)) {
    throw new Error('DELIMITER directives are not supported in tracked migrations.')
  }

  const statements = []
  let current = ''
  let quote = null
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (lineComment) {
      if (char === '\n') {
        lineComment = false
        current += char
      }
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (!quote && char === '-' && next === '-' && /\s/.test(sql[index + 2] || '')) {
      lineComment = true
      index += 1
      continue
    }
    if (!quote && char === '#') {
      lineComment = true
      continue
    }
    if (!quote && char === '/' && next === '*') {
      if (sql[index + 2] === '!') {
        throw new Error('MySQL executable comments are not supported in tracked migrations.')
      }
      if (current && !/\s$/.test(current)) current += ' '
      blockComment = true
      index += 1
      continue
    }

    if (quote) {
      current += char
      if (char === '\\') {
        current += next || ''
        index += 1
      } else if (char === quote) {
        if (next === quote) {
          current += next
          index += 1
        } else {
          quote = null
        }
      }
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      current += char
    } else if (char === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  if (quote || blockComment) {
    throw new Error('Unterminated quote or block comment in migration SQL.')
  }
  if (current.trim()) statements.push(current.trim())
  return statements
}

function migrationLockName(databaseName) {
  const digest = createHash('sha256').update(databaseName).digest('hex').slice(0, 24)
  return `global_lab_migrations_${digest}`
}

async function ensureMigrationTable(connection) {
  await connection.query([
    'CREATE TABLE IF NOT EXISTS `schema_migrations` (',
    '`filename` VARCHAR(255) NOT NULL,',
    '`checksum_sha256` CHAR(64) NOT NULL,',
    '`execution_ms` INT UNSIGNED NOT NULL,',
    '`applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    'PRIMARY KEY (`filename`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join(' '))
}

async function readAppliedMigrations(connection) {
  const [rows] = await connection.query(
    'SELECT `filename`, `checksum_sha256` FROM `schema_migrations` ORDER BY `filename`'
  )
  return new Map(rows.map((row) => [row.filename, row.checksum_sha256]))
}

function assertMigrationHistory(migrations, applied) {
  const tracked = new Map(migrations.map((migration) => [migration.filename, migration.checksum]))
  for (const [filename, checksum] of applied) {
    if (!tracked.has(filename)) {
      throw new Error(`Database contains an unknown applied migration: ${filename}`)
    }
    if (tracked.get(filename) !== checksum) {
      throw new Error(`Applied migration checksum does not match: ${filename}`)
    }
  }

  const appliedNames = [...applied.keys()]
  for (let index = 0; index < appliedNames.length; index += 1) {
    const expected = migrations[index]?.filename
    const actual = appliedNames[index]
    if (actual !== expected) {
      throw new Error(
        `Applied migration history is not an ordered prefix: expected ${expected || 'no migration'}, found ${actual}`
      )
    }
  }
}

async function assertBaselineSchema(connection) {
  const [tables] = await connection.query([
    'SELECT `TABLE_NAME`, `ENGINE`, `TABLE_COLLATION`',
    'FROM `INFORMATION_SCHEMA`.`TABLES`',
    'WHERE `TABLE_SCHEMA` = DATABASE()',
    "AND `TABLE_NAME` IN ('certificates', 'certificate_thumbnails')",
  ].join(' '))
  const [columns] = await connection.query([
    'SELECT `TABLE_NAME`, `COLUMN_NAME`, `COLUMN_TYPE`, `DATA_TYPE`, `IS_NULLABLE`,',
    '`COLUMN_DEFAULT`, `COLLATION_NAME`, `EXTRA`, `GENERATION_EXPRESSION`',
    'FROM `INFORMATION_SCHEMA`.`COLUMNS`',
    'WHERE `TABLE_SCHEMA` = DATABASE()',
    "AND `TABLE_NAME` IN ('certificates', 'certificate_thumbnails')",
  ].join(' '))
  const [indexVisibilityColumns] = await connection.query([
    'SELECT COUNT(*) AS `column_count`',
    'FROM `INFORMATION_SCHEMA`.`COLUMNS`',
    "WHERE LOWER(`TABLE_SCHEMA`) = 'information_schema'",
    "AND LOWER(`TABLE_NAME`) = 'statistics'",
    "AND LOWER(`COLUMN_NAME`) = 'is_visible'",
  ].join(' '))
  const indexVisibilityProjection = Number(indexVisibilityColumns[0]?.column_count) > 0
    ? '`IS_VISIBLE`'
    : "'YES' AS `IS_VISIBLE`"
  const [indexes] = await connection.query([
    'SELECT `TABLE_NAME`, `INDEX_NAME`, `NON_UNIQUE`, `SEQ_IN_INDEX`, `COLUMN_NAME`,',
    `\`SUB_PART\`, ${indexVisibilityProjection}`,
    'FROM `INFORMATION_SCHEMA`.`STATISTICS`',
    'WHERE `TABLE_SCHEMA` = DATABASE()',
    "AND `TABLE_NAME` IN ('certificates', 'certificate_thumbnails')",
  ].join(' '))
  const [foreignKeys] = await connection.query([
    'SELECT `kcu`.`TABLE_SCHEMA`, `kcu`.`TABLE_NAME`, `kcu`.`CONSTRAINT_NAME`,',
    '`kcu`.`COLUMN_NAME`, `kcu`.`ORDINAL_POSITION`,',
    '`kcu`.`REFERENCED_TABLE_SCHEMA`, `kcu`.`REFERENCED_TABLE_NAME`,',
    '`kcu`.`REFERENCED_COLUMN_NAME`, `rc`.`DELETE_RULE`, `rc`.`UPDATE_RULE`',
    'FROM `INFORMATION_SCHEMA`.`KEY_COLUMN_USAGE` AS `kcu`',
    'JOIN `INFORMATION_SCHEMA`.`REFERENTIAL_CONSTRAINTS` AS `rc`',
    'ON `rc`.`CONSTRAINT_SCHEMA` = `kcu`.`CONSTRAINT_SCHEMA`',
    'AND `rc`.`CONSTRAINT_NAME` = `kcu`.`CONSTRAINT_NAME`',
    'WHERE `kcu`.`TABLE_SCHEMA` = DATABASE()',
    "AND `kcu`.`TABLE_NAME` = 'certificate_thumbnails'",
    'AND `kcu`.`REFERENCED_TABLE_NAME` IS NOT NULL',
  ].join(' '))

  const errors = baselineSchemaErrors({ tables, columns, indexes, foreignKeys })
  if (errors.length > 0) {
    throw new Error(`Baseline schema verification failed: ${errors.join('; ')}`)
  }
}

function baselineSchemaErrors(metadata) {
  const errors = []
  const tableMap = new Map(metadata.tables.map((row) => [row.TABLE_NAME, row]))
  for (const tableName of ['certificates', 'certificate_thumbnails']) {
    const table = tableMap.get(tableName)
    if (!table) {
      errors.push(`missing table ${tableName}`)
      continue
    }
    if (String(table.ENGINE).toLowerCase() !== 'innodb') {
      errors.push(`${tableName} must use InnoDB`)
    }
    if (String(table.TABLE_COLLATION).toLowerCase() !== 'utf8mb4_unicode_ci') {
      errors.push(`${tableName} must use utf8mb4_unicode_ci`)
    }
  }

  const requiredColumns = {
    certificates: {
      id: { type: 'bigint unsigned', nullable: 'NO', extra: 'auto_increment' },
      appwrite_document_id: { type: 'varchar(64)', nullable: 'NO', collation: 'utf8mb4_unicode_ci' },
      CERTIFICATE_NO: { type: 'varchar(64)', nullable: 'NO', collation: 'utf8mb4_unicode_ci' },
      Certificate_photograph: { type: 'varchar(255)', nullable: 'YES', collation: 'utf8mb4_unicode_ci' },
      PRODUCT_NAME: { type: 'varchar(64)', nullable: 'YES', collation: 'utf8mb4_unicode_ci' },
      CATEGORY: { type: 'varchar(64)', nullable: 'YES', collation: 'utf8mb4_unicode_ci' },
      r2_object_key: { type: 'varchar(255)', nullable: 'YES', collation: 'utf8mb4_unicode_ci' },
      appwrite_created_at: { type: 'datetime(3)', nullable: 'YES' },
      appwrite_updated_at: { type: 'datetime(3)', nullable: 'YES' },
      created_at: { type: 'timestamp', nullable: 'NO', defaultValue: 'current_timestamp' },
      updated_at: {
        type: 'timestamp',
        nullable: 'NO',
        defaultValue: 'current_timestamp',
        extra: 'on update current_timestamp',
      },
    },
    certificate_thumbnails: {
      certificate_id: { type: 'bigint unsigned', nullable: 'NO' },
      thumbnail_blob: { type: 'mediumblob', nullable: 'NO' },
      thumbnail_mime: { type: 'varchar(50)', nullable: 'NO', collation: 'utf8mb4_unicode_ci' },
      thumbnail_width: { type: 'smallint unsigned', nullable: 'NO' },
      thumbnail_height: { type: 'smallint unsigned', nullable: 'NO' },
      thumbnail_size_bytes: { type: 'int unsigned', nullable: 'NO' },
      thumbnail_sha256: { type: 'char(64)', nullable: 'NO', collation: 'utf8mb4_unicode_ci' },
      created_at: { type: 'timestamp', nullable: 'NO', defaultValue: 'current_timestamp' },
      updated_at: {
        type: 'timestamp',
        nullable: 'NO',
        defaultValue: 'current_timestamp',
        extra: 'on update current_timestamp',
      },
    },
  }
  const columnMap = new Map(metadata.columns.map((row) => [
    `${row.TABLE_NAME}.${row.COLUMN_NAME}`,
    row,
  ]))
  for (const [tableName, expectedColumns] of Object.entries(requiredColumns)) {
    for (const [columnName, expected] of Object.entries(expectedColumns)) {
      const column = columnMap.get(`${tableName}.${columnName}`)
      if (!column) {
        errors.push(`missing column ${tableName}.${columnName}`)
        continue
      }
      if (normalizeColumnType(column.COLUMN_TYPE) !== expected.type) {
        errors.push(`${tableName}.${columnName} has type ${column.COLUMN_TYPE}, expected ${expected.type}`)
      }
      if (column.IS_NULLABLE !== expected.nullable) {
        errors.push(`${tableName}.${columnName} nullability is ${column.IS_NULLABLE}, expected ${expected.nullable}`)
      }
      if (normalizeDefault(column.COLUMN_DEFAULT) !== (expected.defaultValue || null)) {
        errors.push(`${tableName}.${columnName} has an incompatible default`)
      }
      if ((column.COLLATION_NAME || null) !== (expected.collation || null)) {
        errors.push(`${tableName}.${columnName} has an incompatible collation`)
      }
      if (String(column.GENERATION_EXPRESSION || '') !== '') {
        errors.push(`${tableName}.${columnName} must not be generated`)
      }
      const extra = String(column.EXTRA || '').toLowerCase()
      if (expected.extra && !extra.includes(expected.extra)) {
        errors.push(`${tableName}.${columnName} is missing ${expected.extra}`)
      }
      if (!expected.extra && (extra.includes('auto_increment') || extra.includes('on update'))) {
        errors.push(`${tableName}.${columnName} has incompatible extra behavior`)
      }
    }
  }

  const requiredIndexes = [
    ['certificates', 'PRIMARY', 0, ['id']],
    ['certificates', 'uniq_appwrite_document_id', 0, ['appwrite_document_id']],
    ['certificates', 'idx_certificate_no', 1, ['CERTIFICATE_NO']],
    ['certificates', 'idx_category', 1, ['CATEGORY']],
    ['certificates', 'idx_product_name', 1, ['PRODUCT_NAME']],
    ['certificate_thumbnails', 'PRIMARY', 0, ['certificate_id']],
    ['certificate_thumbnails', 'idx_thumbnail_sha256', 1, ['thumbnail_sha256']],
  ]
  for (const [tableName, indexName, nonUnique, columnNames] of requiredIndexes) {
    const rows = metadata.indexes
      .filter((row) => row.TABLE_NAME === tableName && row.INDEX_NAME === indexName)
      .sort((left, right) => Number(left.SEQ_IN_INDEX) - Number(right.SEQ_IN_INDEX))
    const compatible = (
      rows.length === columnNames.length &&
      rows.every((row, index) => (
        Number(row.NON_UNIQUE) === nonUnique &&
        Number(row.SEQ_IN_INDEX) === index + 1 &&
        row.COLUMN_NAME === columnNames[index] &&
        row.SUB_PART === null &&
        (!row.IS_VISIBLE || String(row.IS_VISIBLE).toUpperCase() === 'YES')
      ))
    )
    if (!compatible) errors.push(`index ${tableName}.${indexName} has an incompatible definition`)
  }

  const thumbnailConstraintRows = metadata.foreignKeys.filter((row) => (
    row.TABLE_NAME === 'certificate_thumbnails' &&
    row.CONSTRAINT_NAME === 'fk_certificate_thumbnails_certificate'
  ))
  const thumbnailForeignKeyCompatible = (
    thumbnailConstraintRows.length === 1 &&
    thumbnailConstraintRows[0].TABLE_SCHEMA === thumbnailConstraintRows[0].REFERENCED_TABLE_SCHEMA &&
    thumbnailConstraintRows[0].COLUMN_NAME === 'certificate_id' &&
    Number(thumbnailConstraintRows[0].ORDINAL_POSITION) === 1 &&
    thumbnailConstraintRows[0].REFERENCED_TABLE_NAME === 'certificates' &&
    thumbnailConstraintRows[0].REFERENCED_COLUMN_NAME === 'id' &&
    String(thumbnailConstraintRows[0].DELETE_RULE).toUpperCase() === 'CASCADE' &&
    ['NO ACTION', 'RESTRICT'].includes(String(thumbnailConstraintRows[0].UPDATE_RULE).toUpperCase())
  )
  if (!thumbnailForeignKeyCompatible) {
    errors.push('certificate_thumbnails.certificate_id foreign key has an incompatible definition')
  }

  return errors
}

function normalizeColumnType(type) {
  return String(type)
    .toLowerCase()
    .replace(/^(tinyint|smallint|mediumint|int|bigint)\(\d+\)/, '$1')
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null
  const normalized = String(value).toLowerCase().replace(/\(\)$/, '')
  return normalized === 'null' ? null : normalized
}
