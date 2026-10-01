#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')
const backupDir =
  process.env.MIGRATION_BACKUP_DIR ||
  'backups/appwrite/2026-09-19T21-08-58-219Z'
const certificatesTableName = process.env.MYSQL_CERTIFICATES_TABLE || 'certificates'
const thumbnailsTableName =
  process.env.MYSQL_THUMBNAILS_TABLE || 'certificate_thumbnails'
const base = path.join(repoRoot, backupDir)

const docs = JSON.parse(await readFile(path.join(base, 'certificates.json'), 'utf8'))
const r2Manifest = JSON.parse(
  await readFile(path.join(base, 'r2-upload-manifest.json'), 'utf8')
)
const thumbnailManifest = await readOptionalJson(path.join(base, 'thumbnail-manifest.json'))
const createSql = await readFile(
  path.join(base, 'mysql', '001_create_certificates.sql'),
  'utf8'
)
const insertSql = await readFile(
  path.join(base, 'mysql', '002_insert_certificates.sql'),
  'utf8'
)

const uploadItems = r2Manifest.uploadItems || []
const missingItems = r2Manifest.missingItems || []
const thumbnailItems = thumbnailManifest?.thumbnailItems || []
const errors = []

if (r2Manifest.cleanRows !== docs.length) {
  errors.push(
    `R2 manifest cleanRows ${r2Manifest.cleanRows} does not match clean backup rows ${docs.length}`
  )
}

if (uploadItems.length !== docs.length) {
  errors.push(
    `R2 upload item count ${uploadItems.length} does not match clean backup rows ${docs.length}`
  )
}

if (missingItems.length !== 0) {
  errors.push(`R2 manifest has ${missingItems.length} missing image item(s)`)
}

if (thumbnailManifest) {
  if (thumbnailManifest.cleanRows !== docs.length) {
    errors.push(
      `Thumbnail manifest cleanRows ${thumbnailManifest.cleanRows} does not match clean backup rows ${docs.length}`
    )
  }

  if (thumbnailItems.length !== docs.length) {
    errors.push(
      `Thumbnail item count ${thumbnailItems.length} does not match clean backup rows ${docs.length}`
    )
  }

  if ((thumbnailManifest.errors || []).length > 0) {
    errors.push(`Thumbnail manifest has ${thumbnailManifest.errors.length} error(s)`)
  }
}

const certificateInsert = findInsertStatement(insertSql, certificatesTableName)
const certificateSqlRows = countInsertRows(certificateInsert)
if (certificateSqlRows !== docs.length) {
  errors.push(
    `MySQL certificate insert row count ${certificateSqlRows} does not match clean backup rows ${docs.length}`
  )
}

const thumbnailInsert = findInsertStatement(insertSql, thumbnailsTableName)
const thumbnailSqlRows = countInsertRows(thumbnailInsert)
if (thumbnailManifest && thumbnailSqlRows !== thumbnailItems.length) {
  errors.push(
    `MySQL thumbnail insert row count ${thumbnailSqlRows} does not match thumbnail manifest items ${thumbnailItems.length}`
  )
}

if (thumbnailManifest) {
  const thumbnailTableMarker = `CREATE TABLE IF NOT EXISTS ${qid(thumbnailsTableName)}`
  const thumbnailTableIndex = createSql.indexOf(thumbnailTableMarker)
  const firstThumbnailColumnIndex = createSql.indexOf('`thumbnail_blob`')

  if (thumbnailTableIndex === -1) {
    errors.push(`MySQL create SQL does not include ${thumbnailsTableName}`)
  }

  if (
    firstThumbnailColumnIndex !== -1 &&
    thumbnailTableIndex !== -1 &&
    firstThumbnailColumnIndex < thumbnailTableIndex
  ) {
    errors.push('MySQL create SQL still places thumbnail columns on the certificates table')
  }

  if (
    !createSql.includes('FOREIGN KEY (`certificate_id`)') ||
    !createSql.includes('ON DELETE CASCADE')
  ) {
    errors.push('MySQL create SQL does not include the thumbnail foreign key with ON DELETE CASCADE')
  }

  if (!thumbnailInsert.includes('`thumbnail_blob`')) {
    errors.push('MySQL thumbnail insert SQL does not include thumbnail columns')
  }
}

const docIds = new Set(docs.map((doc) => doc.$id))
for (const item of uploadItems) {
  if (!docIds.has(item.appwriteDocumentId)) {
    errors.push(`R2 item references unknown document ${item.appwriteDocumentId}`)
  }

  const sourcePath = path.join(repoRoot, item.sourcePath)
  const actualSha256 = await sha256File(sourcePath)
  if (actualSha256 !== item.sha256) {
    errors.push(`SHA mismatch for ${item.sourcePath}`)
  }
}

const objectKeys = uploadItems.map((item) => item.r2ObjectKey)
const duplicateObjectKeys = duplicates(objectKeys)
if (duplicateObjectKeys.length > 0) {
  errors.push(`Duplicate R2 object keys: ${duplicateObjectKeys.join(', ')}`)
}

for (const item of thumbnailItems) {
  if (!docIds.has(item.appwriteDocumentId)) {
    errors.push(`Thumbnail item references unknown document ${item.appwriteDocumentId}`)
  }

  const thumbnailPath = path.join(repoRoot, item.thumbnailPath)
  const actualSha256 = await sha256File(thumbnailPath)
  if (actualSha256 !== item.sha256) {
    errors.push(`Thumbnail SHA mismatch for ${item.thumbnailPath}`)
  }

  if (
    thumbnailManifest?.thumbnailMaxBytes &&
    item.bytes > thumbnailManifest.thumbnailMaxBytes
  ) {
    errors.push(
      `Thumbnail ${item.thumbnailPath} is ${item.bytes} bytes, above ${thumbnailManifest.thumbnailMaxBytes}`
    )
  }
}

const certificateNumbers = docs.map((doc) => doc.CERTIFICATE_NO).filter(Boolean)
const duplicateCertificates = duplicates(certificateNumbers)
const needsReviewUploads = uploadItems.filter((item) =>
  item.r2ObjectKey.startsWith('certificates/_needs-review/')
).length

console.log(`Clean backup rows: ${docs.length}`)
console.log(`MySQL certificate insert rows: ${certificateSqlRows}`)
console.log(`MySQL thumbnail insert rows: ${thumbnailSqlRows}`)
console.log(`R2 upload items: ${uploadItems.length}`)
console.log(`R2 missing image items: ${missingItems.length}`)
console.log(`Thumbnail items: ${thumbnailItems.length}`)
console.log(`Duplicate certificate numbers still under review: ${duplicateCertificates.length}`)
console.log(`R2 _needs-review upload items: ${needsReviewUploads}`)

if (errors.length > 0) {
  console.error('\nValidation failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('\nMigration artifacts are internally consistent.')

function findInsertStatement(sql, tableName) {
  const marker = `INSERT INTO ${qid(tableName)}`
  const start = sql.indexOf(marker)
  if (start === -1) return ''

  let inString = false
  for (let i = start; i < sql.length; i += 1) {
    const char = sql[i]
    const next = sql[i + 1]

    if (inString) {
      if (char === "'" && next === "'") {
        i += 1
      } else if (char === "'") {
        inString = false
      }
      continue
    }

    if (char === "'") {
      inString = true
      continue
    }

    if (char === ';') return sql.slice(start, i + 1)
  }

  return sql.slice(start)
}

function countInsertRows(sql) {
  const marker = 'VALUES\n'
  const index = sql.indexOf(marker)
  if (index === -1) return 0

  const values = sql.slice(index + marker.length).trim()
  if (!values || values === ';') return 0

  let count = 0
  let depth = 0
  let inString = false

  for (let i = 0; i < values.length; i += 1) {
    const char = values[i]
    const next = values[i + 1]

    if (inString) {
      if (char === "'" && next === "'") {
        i += 1
      } else if (char === "'") {
        inString = false
      }
      continue
    }

    if (char === "'") {
      inString = true
      continue
    }

    if (char === '(') {
      if (depth === 0) count += 1
      depth += 1
    } else if (char === ')') {
      depth -= 1
    }
  }

  return count
}

function qid(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``
}


async function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(await readFile(filePath))
  return hash.digest('hex')
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function duplicates(values) {
  const seen = new Set()
  const duplicated = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicated.add(value)
    seen.add(value)
  }
  return Array.from(duplicated).sort()
}
