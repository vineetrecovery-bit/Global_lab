#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createWriteStream, readFileSync } from 'node:fs'
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Query } from 'appwrite'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')

loadEnvFile(path.join(repoRoot, '.env'))
loadEnvFile(path.join(repoRoot, '.env.local'))

const missingEnv = []

const config = {
  endpoint: requiredEnv('NEXT_PUBLIC_APPWRITE_ENDPOINT').replace(/\/$/, ''),
  projectId: requiredEnv('NEXT_PUBLIC_APPWRITE_PROJECT_ID'),
  databaseId: requiredEnv('NEXT_PUBLIC_APPWRITE_DATABASE_ID'),
  collectionId: requiredEnv('NEXT_PUBLIC_APPWRITE_CERTIFICATES_COLLECTION'),
  bucketId: requiredEnv('NEXT_PUBLIC_APPWRITE_BUCKET_ID'),
  apiKey: requiredEnv('APPWRITE_API_KEY'),
  backupRoot: process.env.APPWRITE_BACKUP_ROOT || 'backups/appwrite',
  documentPageSize: numberEnv('APPWRITE_DOCUMENT_PAGE_SIZE', 100),
  storagePageSize: numberEnv('APPWRITE_STORAGE_PAGE_SIZE', 100),
  downloadConcurrency: numberEnv('APPWRITE_DOWNLOAD_CONCURRENCY', 4),
  imageFields: listEnv('APPWRITE_IMAGE_FIELDS', [
    'Certificate_photograph',
    'certificate_photograph',
    'Certificate Photograph',
  ]),
  certificateFields: listEnv('APPWRITE_CERTIFICATE_FIELDS', [
    'CERTIFICATE_NO',
    'CERTIFICATE NO',
    'Certificate No',
    'Certificate_No',
    'Batchno',
    'BatchNo',
    'batch_no',
  ]),
}

if (missingEnv.length > 0) {
  console.error('Missing required environment variables:')
  for (const name of missingEnv) {
    console.error(`- ${name}`)
  }
  console.error('')
  console.error('Add them to .env or .env.local, then run: npm run backup:appwrite')
  process.exit(1)
}

const startedAt = new Date()
const backupDir = path.join(
  repoRoot,
  config.backupRoot,
  timestampForPath(startedAt)
)
const imagesDir = path.join(backupDir, 'images')
const unreferencedImagesDir = path.join(imagesDir, '_unreferenced')

let downloadTargetCount = 0

const manifest = {
  exportedAt: startedAt.toISOString(),
  completedAt: null,
  appwrite: {
    endpoint: config.endpoint,
    projectId: config.projectId,
    databaseId: config.databaseId,
    collectionId: config.collectionId,
    bucketId: config.bucketId,
  },
  counts: {
    documentsExpected: null,
    documentsExported: 0,
    storageFilesExpected: null,
    storageFilesListed: 0,
    referencedImageIds: 0,
    downloadedImages: 0,
    failedImageDownloads: 0,
    referencedMissingFromBucket: 0,
    duplicateCertificateNumbers: 0,
  },
  fields: {
    imageFields: config.imageFields,
    certificateFields: config.certificateFields,
  },
  files: {},
  duplicateCertificateNumbers: [],
  referencedMissingFromBucket: [],
  failedImageDownloads: [],
  nonAppwriteImageValues: [],
  criticalIssues: [],
  storageListingUnavailable: null,
  warnings: [],
}

await main()

async function main() {
  await mkdir(imagesDir, { recursive: true })
  await mkdir(unreferencedImagesDir, { recursive: true })

  console.log(`Creating Appwrite backup in ${path.relative(repoRoot, backupDir)}`)

  const [collection, attributes, indexes] = await Promise.all([
    getCollection(),
    getAttributes(),
    getIndexes(),
  ])

  await writeJson('schema.json', {
    collection,
    attributes,
    indexes,
  })

  const documentsResult = await listAllDocuments()
  const documents = documentsResult.documents
  manifest.counts.documentsExpected = documentsResult.total
  manifest.counts.documentsExported = documents.length

  await writeJson('certificates.json', documents)
  await writeText('certificates.csv', toCsv(documents))

  const certificateNumberCounts = countCertificateNumbers(documents)
  manifest.duplicateCertificateNumbers = Array.from(certificateNumberCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([certificateNo, count]) => ({ certificateNo, count }))
  manifest.counts.duplicateCertificateNumbers = manifest.duplicateCertificateNumbers.length

  const imageReferences = collectImageReferences(documents)
  const referencedIds = new Set(imageReferences.map((ref) => ref.fileId))
  manifest.counts.referencedImageIds = referencedIds.size

  const storageResult = await listAllStorageFiles().catch((error) => {
    manifest.storageListingUnavailable = error.message
    manifest.warnings.push(
      `Could not list storage bucket files. Falling back to referenced document images only: ${error.message}`
    )
    return { files: [], total: null }
  })
  const storageFiles = storageResult.files
  const storageFilesById = new Map(storageFiles.map((file) => [String(file.$id), file]))
  manifest.counts.storageFilesExpected = storageResult.total
  manifest.counts.storageFilesListed = storageFiles.length

  await writeJson('storage-files.json', storageFiles)
  await writeJson('image-references.json', imageReferences)

  if (manifest.storageListingUnavailable) {
    for (const fileId of referencedIds) {
      manifest.referencedMissingFromBucket.push({
        fileId,
        references: imageReferences.filter((ref) => ref.fileId === fileId),
        bucketListingUnavailable: true,
      })
    }
  } else {
    for (const fileId of referencedIds) {
      if (!storageFilesById.has(fileId)) {
        manifest.referencedMissingFromBucket.push({
          fileId,
          references: imageReferences.filter((ref) => ref.fileId === fileId),
        })
      }
    }
  }
  manifest.counts.referencedMissingFromBucket = manifest.referencedMissingFromBucket.length

  const downloadTargets = createDownloadTargets({
    storageFiles,
    storageFilesById,
    imageReferences,
    referencedIds,
  })

  await writeJson('download-targets.json', downloadTargets)
  await downloadFiles(downloadTargets)

  await writeJson('manifest.json', finalizeManifest())

  console.log('')
  console.log('Backup complete.')
  console.log(`Documents: ${manifest.counts.documentsExported}/${manifest.counts.documentsExpected}`)
  console.log(`Storage files listed: ${manifest.counts.storageFilesListed}/${manifest.counts.storageFilesExpected}`)
  console.log(`Referenced image IDs: ${manifest.counts.referencedImageIds}`)
  console.log(`Images downloaded: ${manifest.counts.downloadedImages}`)
  console.log(`Failed image downloads: ${manifest.counts.failedImageDownloads}`)
  console.log(`Referenced images missing from bucket listing: ${manifest.counts.referencedMissingFromBucket}`)
  console.log(`Manifest: ${path.relative(repoRoot, path.join(backupDir, 'manifest.json'))}`)

  if (manifest.criticalIssues.length > 0) {
    console.error('')
    console.error('Backup completed with critical issues:')
    for (const issue of manifest.criticalIssues) {
      console.error(`- ${issue}`)
    }
    process.exitCode = 1
  }
}

async function getCollection() {
  return appwriteJson(
    `/databases/${encodeURIComponent(config.databaseId)}/collections/${encodeURIComponent(config.collectionId)}`
  )
}

async function getAttributes() {
  const data = await appwriteJson(
    `/databases/${encodeURIComponent(config.databaseId)}/collections/${encodeURIComponent(config.collectionId)}/attributes`
  )
  return data.attributes || []
}

async function getIndexes() {
  try {
    const data = await appwriteJson(
      `/databases/${encodeURIComponent(config.databaseId)}/collections/${encodeURIComponent(config.collectionId)}/indexes`
    )
    return data.indexes || []
  } catch (error) {
    manifest.warnings.push(`Could not export collection indexes: ${error.message}`)
    return []
  }
}

async function listAllDocuments() {
  const documents = []
  let total = null
  let cursor = null

  while (true) {
    const queries = [
      Query.orderAsc('$id'),
      Query.limit(config.documentPageSize),
    ]
    if (cursor) queries.push(Query.cursorAfter(cursor))

    const data = await appwriteJson(
      `/databases/${encodeURIComponent(config.databaseId)}/collections/${encodeURIComponent(config.collectionId)}/documents`,
      { queries }
    )

    if (total === null) total = Number(data.total ?? 0)

    const batch = data.documents || []
    documents.push(...batch)

    console.log(`Fetched documents: ${documents.length}/${total}`)

    if (batch.length === 0 || batch.length < config.documentPageSize) break

    cursor = batch[batch.length - 1].$id
    if (!cursor) {
      throw new Error('Document pagination stopped because the last document has no $id')
    }
  }

  if (total !== null && documents.length !== total) {
    manifest.warnings.push(
      `Document total mismatch. Appwrite reported ${total}, exported ${documents.length}. Check whether data changed during export.`
    )
  }

  return { documents, total }
}

async function listAllStorageFiles() {
  const files = []
  let total = null
  let cursor = null

  while (true) {
    const queries = [
      Query.orderAsc('$id'),
      Query.limit(config.storagePageSize),
    ]
    if (cursor) queries.push(Query.cursorAfter(cursor))

    const data = await appwriteJson(
      `/storage/buckets/${encodeURIComponent(config.bucketId)}/files`,
      { queries }
    )

    if (total === null) total = Number(data.total ?? 0)

    const batch = data.files || []
    files.push(...batch)

    console.log(`Listed storage files: ${files.length}/${total}`)

    if (batch.length === 0 || batch.length < config.storagePageSize) break

    cursor = batch[batch.length - 1].$id
    if (!cursor) {
      throw new Error('Storage pagination stopped because the last file has no $id')
    }
  }

  if (total !== null && files.length !== total) {
    manifest.warnings.push(
      `Storage file total mismatch. Appwrite reported ${total}, listed ${files.length}. Check whether storage changed during export.`
    )
  }

  return { files, total }
}

function collectImageReferences(documents) {
  const references = []

  for (const doc of documents) {
    const certificateNo = getFirstFieldValue(doc, config.certificateFields) || doc.$id

    for (const field of config.imageFields) {
      const raw = doc[field]
      const values = Array.isArray(raw) ? raw : [raw]

      for (const value of values) {
        if (value === null || value === undefined || String(value).trim() === '') continue

        const extracted = extractFileId(String(value))
        if (!extracted) {
          manifest.nonAppwriteImageValues.push({
            documentId: doc.$id,
            certificateNo,
            field,
            value: String(value),
          })
          continue
        }

        references.push({
          documentId: doc.$id,
          certificateNo: String(certificateNo),
          field,
          originalValue: String(value),
          fileId: extracted,
        })
      }
    }
  }

  return references
}

function createDownloadTargets({
  storageFiles,
  storageFilesById,
  imageReferences,
  referencedIds,
}) {
  const referencesByFileId = groupBy(imageReferences, (ref) => ref.fileId)
  const targets = []
  const usedRelativePaths = new Set()

  for (const file of storageFiles) {
    const fileId = String(file.$id)
    const references = referencesByFileId.get(fileId) || []
    const extension = getFileExtension(file)
    const originalName = safeFileName(file.name || fileId)
    let relativePath

    if (references.length === 1) {
      const certificateName = safeFileName(references[0].certificateNo || fileId)
      relativePath = `images/${certificateName}${extension}`
    } else if (references.length > 1) {
      relativePath = `images/${safeFileName(fileId)}-${originalName}`
    } else {
      relativePath = `images/_unreferenced/${safeFileName(fileId)}-${originalName}`
    }

    relativePath = uniqueRelativePath(relativePath, usedRelativePaths)

    targets.push({
      fileId,
      relativePath,
      appwriteFileName: file.name || null,
      mimeType: file.mimeType || null,
      sizeOriginal: file.sizeOriginal ?? null,
      references,
      referenced: references.length > 0,
    })
  }

  for (const fileId of referencedIds) {
    if (storageFilesById.has(fileId)) continue

    const references = referencesByFileId.get(fileId) || []
    const certificateName =
      references.length === 1
        ? safeFileName(references[0].certificateNo || fileId)
        : safeFileName(fileId)
    const relativePath = uniqueRelativePath(`images/${certificateName}.bin`, usedRelativePaths)

    targets.push({
      fileId,
      relativePath,
      appwriteFileName: null,
      mimeType: null,
      sizeOriginal: null,
      references,
      referenced: true,
      notInBucketListing: true,
    })
  }

  return targets
}

async function downloadFiles(targets) {
  downloadTargetCount = targets.length
  let index = 0

  async function worker() {
    while (index < targets.length) {
      const target = targets[index++]
      await downloadOneFile(target)
    }
  }

  const workerCount = Math.max(1, Math.min(config.downloadConcurrency, targets.length || 1))
  await Promise.all(Array.from({ length: workerCount }, worker))
}

async function downloadOneFile(target) {
  const destination = path.join(backupDir, target.relativePath)
  await mkdir(path.dirname(destination), { recursive: true })

  try {
    await retry(async () => {
      const url = appwriteUrl(
        `/storage/buckets/${encodeURIComponent(config.bucketId)}/files/${encodeURIComponent(target.fileId)}/download`
      )

      const res = await fetch(url, {
        headers: appwriteHeaders(),
      })

      if (res.status === 401) {
        const publicRes = await fetch(url, {
          headers: publicAppwriteHeaders(),
        })

        if (!publicRes.ok || !publicRes.body) {
          const body = await publicRes.text().catch(() => '')
          throw new Error(`HTTP ${publicRes.status} ${body.slice(0, 300)}`)
        }

        await pipeline(publicRes.body, createWriteStream(destination))
        return
      }

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${body.slice(0, 300)}`)
      }

      await pipeline(res.body, createWriteStream(destination))
    })

    const fileStat = await stat(destination)
    const checksum = await sha256File(destination)
    target.downloaded = true
    target.bytes = fileStat.size
    target.sha256 = checksum
    manifest.counts.downloadedImages += 1
  } catch (error) {
    target.downloaded = false
    target.error = error.message
    manifest.failedImageDownloads.push({
      fileId: target.fileId,
      relativePath: target.relativePath,
      references: target.references,
      error: error.message,
    })
    manifest.counts.failedImageDownloads += 1
  }

  const progress = manifest.counts.downloadedImages + manifest.counts.failedImageDownloads
  console.log(`Downloaded files: ${progress}/${downloadTargetCount} (${target.fileId})`)
}

function finalizeManifest() {
  manifest.completedAt = new Date().toISOString()
  manifest.criticalIssues = collectCriticalIssues()
  manifest.files = {
    schema: 'schema.json',
    certificatesJson: 'certificates.json',
    certificatesCsv: 'certificates.csv',
    storageFiles: 'storage-files.json',
    imageReferences: 'image-references.json',
    downloadTargets: 'download-targets.json',
    imagesDirectory: 'images/',
  }

  return manifest
}

function collectCriticalIssues() {
  const issues = []

  if (manifest.counts.documentsExpected !== manifest.counts.documentsExported) {
    issues.push(
      `Document count mismatch: expected ${manifest.counts.documentsExpected}, exported ${manifest.counts.documentsExported}`
    )
  }

  if (
    !manifest.storageListingUnavailable &&
    manifest.counts.storageFilesExpected !== manifest.counts.storageFilesListed
  ) {
    issues.push(
      `Storage file count mismatch: expected ${manifest.counts.storageFilesExpected}, listed ${manifest.counts.storageFilesListed}`
    )
  }

  if (manifest.counts.failedImageDownloads > 0) {
    issues.push(`${manifest.counts.failedImageDownloads} image/file downloads failed`)
  }

  if (!manifest.storageListingUnavailable && manifest.counts.referencedMissingFromBucket > 0) {
    issues.push(`${manifest.counts.referencedMissingFromBucket} referenced image IDs were missing from the bucket listing`)
  }

  if (manifest.storageListingUnavailable) {
    issues.push(
      'Storage bucket listing was unavailable. Referenced document images were attempted, but orphan bucket files could not be audited.'
    )
  }

  return issues
}

async function appwriteJson(apiPath, { queries = [] } = {}) {
  const url = appwriteUrl(apiPath)
  for (const query of queries) {
    url.searchParams.append('queries[]', query)
  }

  const res = await fetch(url, {
    headers: appwriteHeaders(),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Appwrite request failed (${res.status}) ${apiPath}: ${text.slice(0, 500)}`)
  }

  return text ? JSON.parse(text) : {}
}

function appwriteUrl(apiPath) {
  return new URL(`${config.endpoint}${apiPath}`)
}

function appwriteHeaders() {
  return {
    'X-Appwrite-Project': config.projectId,
    'X-Appwrite-Key': config.apiKey,
  }
}

function publicAppwriteHeaders() {
  return {
    'X-Appwrite-Project': config.projectId,
  }
}

async function writeJson(relativePath, data) {
  await writeText(relativePath, `${JSON.stringify(data, null, 2)}\n`)
}

async function writeText(relativePath, text) {
  const destination = path.join(backupDir, relativePath)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, text, 'utf8')
}

function toCsv(rows) {
  if (rows.length === 0) return ''

  const preferredKeys = [
    '$id',
    '$createdAt',
    '$updatedAt',
    ...config.certificateFields,
    ...config.imageFields,
  ]
  const keys = []
  const seen = new Set()

  for (const key of preferredKeys) {
    if (seen.has(key)) continue
    if (rows.some((row) => Object.prototype.hasOwnProperty.call(row, key))) {
      keys.push(key)
      seen.add(key)
    }
  }

  for (const row of rows) {
    for (const key of Object.keys(row).sort()) {
      if (!seen.has(key)) {
        keys.push(key)
        seen.add(key)
      }
    }
  }

  const lines = [keys.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(keys.map((key) => csvCell(row[key])).join(','))
  }
  return `${lines.join('\n')}\n`
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function countCertificateNumbers(documents) {
  const counts = new Map()

  for (const doc of documents) {
    const certificateNo = getFirstFieldValue(doc, config.certificateFields)
    if (!certificateNo) continue

    const key = String(certificateNo)
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  return counts
}

function getFirstFieldValue(row, fields) {
  for (const field of fields) {
    const value = row[field]
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return value
    }
  }
  return ''
}

function extractFileId(value) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split('/').filter(Boolean)
    const fileIndex = parts.indexOf('files')
    if (fileIndex >= 0 && parts[fileIndex + 1]) return parts[fileIndex + 1]

    const certImageIndex = parts.indexOf('certificate-image')
    if (certImageIndex >= 0 && parts[certImageIndex + 1]) return parts[certImageIndex + 1]

    return ''
  } catch {
    return trimmed
  }
}

function getFileExtension(file) {
  const name = String(file.name || '')
  const ext = path.extname(name)
  if (ext) return ext.toLowerCase()

  const mimeType = String(file.mimeType || '').toLowerCase()
  if (mimeType.includes('jpeg')) return '.jpg'
  if (mimeType.includes('png')) return '.png'
  if (mimeType.includes('webp')) return '.webp'
  if (mimeType.includes('gif')) return '.gif'
  if (mimeType.includes('pdf')) return '.pdf'

  return '.bin'
}

function safeFileName(value) {
  const cleaned = String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 120)

  return cleaned || 'unnamed'
}

function uniqueRelativePath(relativePath, used) {
  let candidate = relativePath
  let counter = 2

  while (used.has(candidate)) {
    const parsed = path.parse(relativePath)
    candidate = path.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`)
    counter += 1
  }

  used.add(candidate)
  return candidate
}

function groupBy(items, getKey) {
  const grouped = new Map()

  for (const item of items) {
    const key = getKey(item)
    const group = grouped.get(key) || []
    group.push(item)
    grouped.set(key, group)
  }

  return grouped
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  const data = await readFile(filePath)
  hash.update(data)
  return hash.digest('hex')
}

async function retry(fn, attempts = 3) {
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750))
      }
    }
  }

  throw lastError
}

function timestampForPath(date) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function loadEnvFile(filePath) {
  let raw
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch {
    return
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const equalsIndex = trimmed.indexOf('=')
    if (equalsIndex === -1) continue

    const key = trimmed.slice(0, equalsIndex).trim()
    let value = trimmed.slice(equalsIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    missingEnv.push(name)
    return ''
  }
  return value
}

function numberEnv(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback

  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return fallback

  return Math.floor(value)
}

function listEnv(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
