import { describe, expect, it, vi } from 'vitest'
import { applyMigrations, splitSqlStatements } from '../scripts/migrations.mjs'

describe('database migration runner', () => {
  it('splits SQL without breaking quoted semicolons or comments', () => {
    expect(splitSqlStatements([
      '-- leading comment',
      "INSERT INTO `example` (`value`) VALUES ('one;two');",
      '/* block; comment */',
      'ALTER TABLE `example` ADD COLUMN `label` VARCHAR(20);',
    ].join('\n'))).toEqual([
      "INSERT INTO `example` (`value`) VALUES ('one;two')",
      'ALTER TABLE `example` ADD COLUMN `label` VARCHAR(20)',
    ])
  })

  it('preserves token separation when removing inline block comments', () => {
    expect(splitSqlStatements('SELECT/* separator */1;')).toEqual(['SELECT 1'])
  })

  it('rejects MySQL executable comments instead of silently discarding their SQL', () => {
    expect(() => splitSqlStatements(
      'CREATE TABLE `one` (`id` INT); /*!80000 ALTER TABLE `one` ADD `label` INT */;'
    )).toThrow('MySQL executable comments are not supported in tracked migrations.')
  })

  it('applies only pending migrations and records their checksums', async () => {
    const connection = fakeConnection(new Map([
      ['001_schema_baseline.sql', 'baseline-checksum'],
    ]))
    const result = await applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', ['CREATE TABLE `one` (`id` INT)']),
      migration('002_add_asset.sql', 'asset-checksum', ['ALTER TABLE `one` ADD `asset_id` BIGINT']),
    ], { databaseName: 'test', logger: silentLogger() })

    expect(result).toEqual({ appliedCount: 1, totalCount: 2 })
    expect(connection.query).toHaveBeenCalledWith('ALTER TABLE `one` ADD `asset_id` BIGINT')
    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO `schema_migrations`'), [
      '002_add_asset.sql',
      'asset-checksum',
      expect.any(Number),
    ])
  })

  it('rejects a changed migration that was already applied', async () => {
    const connection = fakeConnection(new Map([
      ['001_schema_baseline.sql', 'old-checksum'],
    ]))

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'new-checksum', ['SELECT 1']),
    ], { databaseName: 'test', logger: silentLogger() })).rejects.toThrow(
      'Applied migration checksum does not match: 001_schema_baseline.sql'
    )
    expect(connection.query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [expect.any(String)])
  })

  it('rejects database history that is newer than the checked-out code', async () => {
    const connection = fakeConnection(new Map([
      ['001_schema_baseline.sql', 'baseline-checksum'],
      ['002_future.sql', 'future-checksum'],
    ]))

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', ['SELECT 1']),
    ], { databaseName: 'test', logger: silentLogger() })).rejects.toThrow(
      'Database contains an unknown applied migration: 002_future.sql'
    )
  })

  it('rejects applied migrations that are not an ordered prefix', async () => {
    const connection = fakeConnection(new Map([
      ['002_second.sql', 'second-checksum'],
    ]))

    await expect(applyMigrations(connection, [
      migration('001_first.sql', 'first-checksum', ['SELECT 1']),
      migration('002_second.sql', 'second-checksum', ['SELECT 2']),
    ], { databaseName: 'test', logger: silentLogger() })).rejects.toThrow(
      'Applied migration history is not an ordered prefix: expected 001_first.sql, found 002_second.sql'
    )
  })

  it('does not record the baseline when existing schema metadata is incompatible', async () => {
    const connection = fakeConnection(new Map())

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', [
        'CREATE TABLE IF NOT EXISTS `certificates` (`id` BIGINT)',
      ]),
    ], { databaseName: 'test', logger: silentLogger() })).rejects.toThrow(
      'Baseline schema verification failed'
    )
    expect(connection.execute).not.toHaveBeenCalled()
  })

  it('accepts a compatible baseline with legacy MySQL integer display widths', async () => {
    const connection = fakeConnection(new Map(), compatibleBaselineMetadata({ legacyIntegerWidths: true }))

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', ['SELECT 1']),
    ], { databaseName: 'test', logger: silentLogger() })).resolves.toEqual({
      appliedCount: 1,
      totalCount: 1,
    })
  })

  it('accepts a compatible baseline when the database has no index visibility metadata', async () => {
    const metadata = compatibleBaselineMetadata()
    metadata.indexes.forEach((index) => delete index.IS_VISIBLE)
    const connection = fakeConnection(new Map(), metadata, { supportsIndexVisibility: false })

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', ['SELECT 1']),
    ], { databaseName: 'test', logger: silentLogger() })).resolves.toEqual({
      appliedCount: 1,
      totalCount: 1,
    })
  })

  it('accepts the original imported lengths for product name and category', async () => {
    const metadata = compatibleBaselineMetadata()
    const connection = fakeConnection(new Map(), metadata)

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', ['SELECT 1']),
    ], { databaseName: 'test', logger: silentLogger() })).resolves.toEqual({
      appliedCount: 1,
      totalCount: 1,
    })
  })

  it('accepts MariaDB textual NULL metadata for nullable column defaults', async () => {
    const metadata = compatibleBaselineMetadata()
    metadata.columns
      .filter((column) => column.IS_NULLABLE === 'YES' && column.COLUMN_DEFAULT === null)
      .forEach((column) => { column.COLUMN_DEFAULT = 'NULL' })
    const connection = fakeConnection(new Map(), metadata)

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', ['SELECT 1']),
    ], { databaseName: 'test', logger: silentLogger() })).resolves.toEqual({
      appliedCount: 1,
      totalCount: 1,
    })
  })

  it('rejects a baseline whose timestamp defaults are missing', async () => {
    const metadata = compatibleBaselineMetadata()
    metadata.columns.find((column) => (
      column.TABLE_NAME === 'certificates' && column.COLUMN_NAME === 'created_at'
    )).COLUMN_DEFAULT = null
    const connection = fakeConnection(new Map(), metadata)

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', ['SELECT 1']),
    ], { databaseName: 'test', logger: silentLogger() })).rejects.toThrow(
      'certificates.created_at has an incompatible default'
    )
    expect(connection.execute).not.toHaveBeenCalled()
  })

  it('rejects a required index with extra composite columns', async () => {
    const metadata = compatibleBaselineMetadata()
    metadata.indexes.push({
      TABLE_NAME: 'certificates',
      INDEX_NAME: 'uniq_appwrite_document_id',
      NON_UNIQUE: 0,
      SEQ_IN_INDEX: 2,
      COLUMN_NAME: 'id',
      SUB_PART: null,
      IS_VISIBLE: 'YES',
    })
    const connection = fakeConnection(new Map(), metadata)

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', ['SELECT 1']),
    ], { databaseName: 'test', logger: silentLogger() })).rejects.toThrow(
      'index certificates.uniq_appwrite_document_id has an incompatible definition'
    )
    expect(connection.execute).not.toHaveBeenCalled()
  })

  it('rejects a composite foreign key in place of the required single-column cascade', async () => {
    const metadata = compatibleBaselineMetadata()
    metadata.foreignKeys.push({
      ...metadata.foreignKeys[0],
      COLUMN_NAME: 'tenant_id',
      REFERENCED_COLUMN_NAME: 'tenant_id',
      ORDINAL_POSITION: 2,
    })
    const connection = fakeConnection(new Map(), metadata)

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', ['SELECT 1']),
    ], { databaseName: 'test', logger: silentLogger() })).rejects.toThrow(
      'certificate_thumbnails.certificate_id foreign key has an incompatible definition'
    )
    expect(connection.execute).not.toHaveBeenCalled()
  })

  it('does not record a migration when one of its statements fails', async () => {
    const connection = fakeConnection(new Map())
    connection.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT `filename`')) return [[]]
      if (sql === 'BROKEN STATEMENT') throw new Error('synthetic migration failure')
      return [[]]
    })

    await expect(applyMigrations(connection, [
      migration('001_schema_baseline.sql', 'baseline-checksum', [
        'CREATE TABLE `one` (`id` INT)',
        'BROKEN STATEMENT',
      ]),
    ], { databaseName: 'test', logger: silentLogger() })).rejects.toThrow(
      'synthetic migration failure'
    )
    expect(connection.execute).not.toHaveBeenCalled()
    expect(connection.query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [expect.any(String)])
  })
})

function migration(filename, checksum, statements) {
  return { filename, checksum, statements }
}

function silentLogger() {
  return { log: vi.fn(), error: vi.fn() }
}

function fakeConnection(
  applied,
  baselineMetadata = { tables: [], columns: [], indexes: [], foreignKeys: [] },
  { supportsIndexVisibility = true } = {}
) {
  return {
    query: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT `filename`')) {
        return [[...applied].map(([filename, checksum_sha256]) => ({ filename, checksum_sha256 }))]
      }
      if (sql.includes('INFORMATION_SCHEMA`.`TABLES')) return [baselineMetadata.tables]
      if (sql.includes("LOWER(`COLUMN_NAME`) = 'is_visible'")) {
        return [[{ column_count: supportsIndexVisibility ? 1 : 0 }]]
      }
      if (sql.includes('INFORMATION_SCHEMA`.`COLUMNS')) return [baselineMetadata.columns]
      if (sql.includes('INFORMATION_SCHEMA`.`STATISTICS')) {
        if (!supportsIndexVisibility && sql.includes('`SUB_PART`, `IS_VISIBLE`')) {
          throw new Error("Unknown column 'IS_VISIBLE' in 'SELECT'")
        }
        return [baselineMetadata.indexes]
      }
      if (sql.includes('INFORMATION_SCHEMA`.`KEY_COLUMN_USAGE')) return [baselineMetadata.foreignKeys]
      return [[]]
    }),
    execute: vi.fn(async () => [{}]),
  }
}

function compatibleBaselineMetadata({ legacyIntegerWidths = false } = {}) {
  const integer = (modern, legacy) => legacyIntegerWidths ? legacy : modern
  const column = (TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, options = {}) => ({
    TABLE_NAME,
    COLUMN_NAME,
    COLUMN_TYPE,
    DATA_TYPE: COLUMN_TYPE.split('(')[0].split(' ')[0],
    IS_NULLABLE,
    COLUMN_DEFAULT: options.defaultValue ?? null,
    COLLATION_NAME: options.collation ?? null,
    EXTRA: options.extra ?? '',
    GENERATION_EXPRESSION: '',
  })
  const text = { collation: 'utf8mb4_unicode_ci' }

  const columns = [
    column('certificates', 'id', integer('bigint unsigned', 'bigint(20) unsigned'), 'NO', { extra: 'auto_increment' }),
    column('certificates', 'appwrite_document_id', 'varchar(64)', 'NO', text),
    column('certificates', 'CERTIFICATE_NO', 'varchar(64)', 'NO', text),
    column('certificates', 'Certificate_photograph', 'varchar(255)', 'YES', text),
    column('certificates', 'PRODUCT_NAME', 'varchar(64)', 'YES', text),
    column('certificates', 'CATEGORY', 'varchar(64)', 'YES', text),
    column('certificates', 'r2_object_key', 'varchar(255)', 'YES', text),
    column('certificates', 'appwrite_created_at', 'datetime(3)', 'YES'),
    column('certificates', 'appwrite_updated_at', 'datetime(3)', 'YES'),
    column('certificates', 'created_at', 'timestamp', 'NO', { defaultValue: 'CURRENT_TIMESTAMP', extra: 'DEFAULT_GENERATED' }),
    column('certificates', 'updated_at', 'timestamp', 'NO', { defaultValue: 'CURRENT_TIMESTAMP', extra: 'DEFAULT_GENERATED on update CURRENT_TIMESTAMP' }),
    column('certificate_thumbnails', 'certificate_id', integer('bigint unsigned', 'bigint(20) unsigned'), 'NO'),
    column('certificate_thumbnails', 'thumbnail_blob', 'mediumblob', 'NO'),
    column('certificate_thumbnails', 'thumbnail_mime', 'varchar(50)', 'NO', text),
    column('certificate_thumbnails', 'thumbnail_width', integer('smallint unsigned', 'smallint(5) unsigned'), 'NO'),
    column('certificate_thumbnails', 'thumbnail_height', integer('smallint unsigned', 'smallint(5) unsigned'), 'NO'),
    column('certificate_thumbnails', 'thumbnail_size_bytes', integer('int unsigned', 'int(10) unsigned'), 'NO'),
    column('certificate_thumbnails', 'thumbnail_sha256', 'char(64)', 'NO', text),
    column('certificate_thumbnails', 'created_at', 'timestamp', 'NO', { defaultValue: 'CURRENT_TIMESTAMP', extra: 'DEFAULT_GENERATED' }),
    column('certificate_thumbnails', 'updated_at', 'timestamp', 'NO', { defaultValue: 'CURRENT_TIMESTAMP', extra: 'DEFAULT_GENERATED on update CURRENT_TIMESTAMP' }),
  ]
  const index = (TABLE_NAME, INDEX_NAME, NON_UNIQUE, COLUMN_NAME) => ({
    TABLE_NAME,
    INDEX_NAME,
    NON_UNIQUE,
    SEQ_IN_INDEX: 1,
    COLUMN_NAME,
    SUB_PART: null,
    IS_VISIBLE: 'YES',
  })

  return {
    tables: [
      { TABLE_NAME: 'certificates', ENGINE: 'InnoDB', TABLE_COLLATION: 'utf8mb4_unicode_ci' },
      { TABLE_NAME: 'certificate_thumbnails', ENGINE: 'InnoDB', TABLE_COLLATION: 'utf8mb4_unicode_ci' },
    ],
    columns,
    indexes: [
      index('certificates', 'PRIMARY', 0, 'id'),
      index('certificates', 'uniq_appwrite_document_id', 0, 'appwrite_document_id'),
      index('certificates', 'idx_certificate_no', 1, 'CERTIFICATE_NO'),
      index('certificates', 'idx_category', 1, 'CATEGORY'),
      index('certificates', 'idx_product_name', 1, 'PRODUCT_NAME'),
      index('certificate_thumbnails', 'PRIMARY', 0, 'certificate_id'),
      index('certificate_thumbnails', 'idx_thumbnail_sha256', 1, 'thumbnail_sha256'),
    ],
    foreignKeys: [{
      TABLE_SCHEMA: 'global_lab',
      TABLE_NAME: 'certificate_thumbnails',
      CONSTRAINT_NAME: 'fk_certificate_thumbnails_certificate',
      COLUMN_NAME: 'certificate_id',
      ORDINAL_POSITION: 1,
      REFERENCED_TABLE_SCHEMA: 'global_lab',
      REFERENCED_TABLE_NAME: 'certificates',
      REFERENCED_COLUMN_NAME: 'id',
      DELETE_RULE: 'CASCADE',
      UPDATE_RULE: 'NO ACTION',
    }],
  }
}
