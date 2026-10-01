#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')

const backupDir =
  process.env.MIGRATION_BACKUP_DIR ||
  'backups/appwrite/2026-09-19T21-08-58-219Z'
const tableName = process.env.MYSQL_CERTIFICATES_TABLE || 'certificates'
const thumbnailsTableName =
  process.env.MYSQL_THUMBNAILS_TABLE || 'certificate_thumbnails'
const outputDir = path.join(repoRoot, backupDir, 'mysql')

const systemKeys = new Set([
  '$id',
  '$collectionId',
  '$databaseId',
  '$createdAt',
  '$updatedAt',
  '$permissions',
  '$sequence',
])

const docs = JSON.parse(
  await readFile(path.join(repoRoot, backupDir, 'certificates.json'), 'utf8')
)
const schema = JSON.parse(
  await readFile(path.join(repoRoot, backupDir, 'schema.json'), 'utf8')
)
const thumbnailManifest = await readOptionalJson(
  path.join(repoRoot, backupDir, 'thumbnail-manifest.json')
)
const thumbnailsByDocumentId = new Map(
  (thumbnailManifest?.thumbnailItems || []).map((item) => [
    String(item.appwriteDocumentId),
    item,
  ])
)

const appwriteColumns = getAppwriteColumns()
const certificateNumberCounts = countBy(
  docs.map((doc) => doc.CERTIFICATE_NO).filter(Boolean)
)
const certificateColumns = [
  { name: 'id', type: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT' },
  { name: 'appwrite_document_id', type: 'VARCHAR(64) NOT NULL' },
  ...appwriteColumns.map((name) => ({
    name,
    type: mysqlTypeFor(name),
  })),
  { name: 'r2_object_key', type: 'VARCHAR(255) NULL' },
  { name: 'appwrite_created_at', type: 'DATETIME(3) NULL' },
  { name: 'appwrite_updated_at', type: 'DATETIME(3) NULL' },
  { name: 'created_at', type: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  {
    name: 'updated_at',
    type: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
]
const thumbnailColumns = [
  { name: 'certificate_id', type: 'BIGINT UNSIGNED NOT NULL' },
  { name: 'thumbnail_blob', type: 'MEDIUMBLOB NOT NULL' },
  { name: 'thumbnail_mime', type: 'VARCHAR(50) NOT NULL' },
  { name: 'thumbnail_width', type: 'SMALLINT UNSIGNED NOT NULL' },
  { name: 'thumbnail_height', type: 'SMALLINT UNSIGNED NOT NULL' },
  { name: 'thumbnail_size_bytes', type: 'INT UNSIGNED NOT NULL' },
  { name: 'thumbnail_sha256', type: 'CHAR(64) NOT NULL' },
  { name: 'created_at', type: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  {
    name: 'updated_at',
    type: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
]

await mkdir(outputDir, { recursive: true })

const createSql = renderCreateTable()
const insertSql = renderInsertSql()
const report = renderReport()

await writeFile(path.join(outputDir, '001_create_certificates.sql'), createSql)
await writeFile(path.join(outputDir, '002_insert_certificates.sql'), insertSql)
await writeFile(path.join(outputDir, 'README.md'), report)

console.log(`Generated MySQL migration files in ${path.relative(repoRoot, outputDir)}`)
console.log(`Rows prepared: ${docs.length}`)

function getAppwriteColumns() {
  const fromSchema = (schema.attributes || [])
    .map((attr) => attr.key)
    .filter(Boolean)
  const fromRows = Array.from(
    new Set(docs.flatMap((doc) => Object.keys(doc).filter((key) => !systemKeys.has(key))))
  )

  const ordered = []
  const seen = new Set()
  for (const key of [...fromSchema, ...fromRows]) {
    if (seen.has(key)) continue
    ordered.push(key)
    seen.add(key)
  }

  return ordered
}

function mysqlTypeFor(column) {
  const values = docs
    .map((doc) => doc[column])
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value))
  const maxLength = Math.max(0, ...values.map((value) => value.length))

  if (column === 'CERTIFICATE_NO') return 'VARCHAR(64) NOT NULL'
  if (column === 'Certificate_photograph') return 'VARCHAR(255) NULL'
  if (maxLength > 1000) return 'TEXT NULL'
  if (maxLength > 255) return 'VARCHAR(1000) NULL'
  return `VARCHAR(${Math.max(64, Math.min(255, nextSize(maxLength)))}) NULL`
}

function nextSize(length) {
  if (length <= 64) return 64
  if (length <= 128) return 128
  return 255
}

function renderCreateTable() {
  const lines = []
  lines.push(`CREATE TABLE IF NOT EXISTS ${qid(tableName)} (`)
  lines.push(
    certificateColumns.map((column) => `  ${qid(column.name)} ${column.type}`).join(',\n') + ','
  )
  lines.push('  PRIMARY KEY (`id`),')
  lines.push('  UNIQUE KEY `uniq_appwrite_document_id` (`appwrite_document_id`),')
  lines.push('  KEY `idx_certificate_no` (`CERTIFICATE_NO`),')
  lines.push('  KEY `idx_category` (`CATEGORY`),')
  lines.push('  KEY `idx_product_name` (`PRODUCT_NAME`)')
  lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;')
  lines.push('')
  lines.push(`CREATE TABLE IF NOT EXISTS ${qid(thumbnailsTableName)} (`)
  lines.push(
    thumbnailColumns.map((column) => `  ${qid(column.name)} ${column.type}`).join(',\n') + ','
  )
  lines.push('  PRIMARY KEY (`certificate_id`),')
  lines.push('  KEY `idx_thumbnail_sha256` (`thumbnail_sha256`),')
  lines.push(
    `  CONSTRAINT ${qid(`fk_${thumbnailsTableName}_certificate`)} FOREIGN KEY (` +
      `\`certificate_id\`) REFERENCES ${qid(tableName)} (\`id\`) ON DELETE CASCADE`
  )
  lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;')
  lines.push('')
  return lines.join('\n')
}

function renderInsertSql() {
  const insertColumns = certificateColumns
    .map((column) => column.name)
    .filter((name) => !['id', 'created_at', 'updated_at'].includes(name))

  const lines = []
  lines.push(`INSERT INTO ${qid(tableName)} (${insertColumns.map(qid).join(', ')}) VALUES`)

  const rows = docs.map((doc) => {
    const values = insertColumns.map((column) => valueForColumn(doc, column))
    return `  (${values.map(sqlValue).join(', ')})`
  })

  lines.push(rows.join(',\n') + ';')
  lines.push('')

  const thumbnailRows = docs
    .map((doc) => renderThumbnailInsertRow(doc))
    .filter(Boolean)

  if (thumbnailRows.length > 0) {
    const thumbnailInsertColumns = thumbnailColumns
      .map((column) => column.name)
      .filter((name) => !['created_at', 'updated_at'].includes(name))

    lines.push(
      `INSERT INTO ${qid(thumbnailsTableName)} (${thumbnailInsertColumns
        .map(qid)
        .join(', ')}) VALUES`
    )
    lines.push(thumbnailRows.join(',\n') + ';')
    lines.push('')
  }

  return lines.join('\n')
}

function valueForColumn(doc, column) {
  if (column === 'appwrite_document_id') return doc.$id
  if (column === 'r2_object_key') return r2ObjectKeyFor(doc)
  if (column === 'appwrite_created_at') return mysqlDateTime(doc.$createdAt)
  if (column === 'appwrite_updated_at') return mysqlDateTime(doc.$updatedAt)
  return doc[column] ?? null
}

function renderThumbnailInsertRow(doc) {
  const thumbnail = thumbnailFor(doc)
  if (!thumbnail) return null

  const certificateId = {
    rawSql: `(SELECT ${qid('id')} FROM ${qid(tableName)} WHERE ${qid('appwrite_document_id')} = ${sqlValue(doc.$id)})`,
  }
  const values = [
    certificateId,
    thumbnailBlobFor(doc),
    thumbnail.mime,
    thumbnail.width,
    thumbnail.height,
    thumbnail.bytes,
    thumbnail.sha256,
  ]

  return `  (${values.map(sqlValue).join(', ')})`
}

function thumbnailFor(doc) {
  return thumbnailsByDocumentId.get(String(doc.$id)) || null
}

function thumbnailBlobFor(doc) {
  const thumbnail = thumbnailFor(doc)
  if (!thumbnail) return null

  return {
    rawSql: `X'${readFileSyncHex(path.join(repoRoot, thumbnail.thumbnailPath))}'`,
  }
}

function r2ObjectKeyFor(doc) {
  const certificateNo = doc.CERTIFICATE_NO
  if (!certificateNo) return null

  const imageValue = doc.Certificate_photograph
  if (!imageValue) return null

  const extension = imageExtensionFor(imageValue)
  if ((certificateNumberCounts.get(certificateNo) || 0) > 1) {
    return `certificates/_needs-review/${safeObjectName(certificateNo)}-${safeObjectName(doc.$id)}${extension}`
  }

  return `certificates/${safeObjectName(certificateNo)}${extension}`
}

function imageExtensionFor(imageValue) {
  const asString = String(imageValue)
  const ext = path.extname(asString)
  return ext || '.jpg'
}

function safeObjectName(value) {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
}

function mysqlDateTime(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object' && value.rawSql) return value.rawSql
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}

function qid(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``
}

function countBy(values) {
  const counts = new Map()
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return counts
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function readFileSyncHex(filePath) {
  return readFileSync(filePath).toString('hex')
}

function renderReport() {
  const duplicateCertificateNumbers = Array.from(certificateNumberCounts.values())
    .filter((count) => count > 1).length
  const duplicateNote = duplicateCertificateNumbers > 0
    ? `- \`CERTIFICATE_NO\` is indexed but not yet unique because ${duplicateCertificateNumbers} conflicting certificate number(s) remain under certification-team review.
- Rows with unresolved duplicate certificate numbers are routed to \`certificates/_needs-review/\` to avoid overwriting files before the certification team resolves them.`
    : '- `CERTIFICATE_NO` is indexed; no duplicate certificate numbers remain in the clean backup.'

  return `# MySQL Import Files

Generated from cleaned backup:

\`${backupDir}/certificates.json\`

Files:

- \`001_create_certificates.sql\`
- \`002_insert_certificates.sql\`

Rows prepared: ${docs.length}

Notes:

${duplicateNote}
- \`Certificate_photograph\` keeps the original Appwrite file ID for traceability.
- \`r2_object_key\` contains the planned Cloudflare R2 object key, for example \`certificates/AR-IN-0012-034.jpg\`.
- \`${thumbnailsTableName}.thumbnail_blob\` stores the small admin-table thumbnail outside the main certificate row so admin pagination can join previews only when needed.
- \`${thumbnailsTableName}.certificate_id\` references \`${tableName}.id\` with \`ON DELETE CASCADE\`.
- \`appwrite_document_id\`, \`appwrite_created_at\`, and \`appwrite_updated_at\` are preserved for auditability during migration.
`
}
