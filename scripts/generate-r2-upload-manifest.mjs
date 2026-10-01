#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')

const backupDir =
  process.env.MIGRATION_BACKUP_DIR ||
  'backups/appwrite/2026-09-19T21-08-58-219Z'
const base = path.join(repoRoot, backupDir)
const imagesDir = path.join(base, 'images')

const docs = JSON.parse(await readFile(path.join(base, 'certificates.json'), 'utf8'))
const storageFiles = JSON.parse(await readFile(path.join(base, 'storage-files.json'), 'utf8'))
const imageFiles = await listFiles(imagesDir)
const certificateNumberCounts = countBy(
  docs.map((doc) => doc.CERTIFICATE_NO).filter(Boolean)
)
const imageFileStats = new Map()
const storageFilesById = new Map(storageFiles.map((file) => [String(file.$id), file]))

const imageFilesByFileId = new Map()
const imageFilesByCertificateName = new Map()

for (const filePath of imageFiles) {
  if (filePath.includes(`${path.sep}_unreferenced${path.sep}`)) continue

  const fileStat = await stat(filePath)
  imageFileStats.set(filePath, fileStat)

  const fileName = path.basename(filePath)
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  const firstPart = withoutExtension.includes('-')
    ? withoutExtension.slice(0, withoutExtension.indexOf('-'))
    : withoutExtension

  imageFilesByFileId.set(firstPart, filePath)
  imageFilesByCertificateName.set(withoutExtension, filePath)
}

const uploads = []
const missing = []
const seenKeys = new Map()

for (const doc of docs) {
  const certificateNo = doc.CERTIFICATE_NO
  const imageValue = doc.Certificate_photograph
  if (!certificateNo || !imageValue) continue

  const sourcePath = sourcePathFor(doc)

  if (!sourcePath) {
    missing.push({
      appwriteDocumentId: doc.$id,
      certificateNo,
      imageValue,
    })
    continue
  }

  const objectKey = r2ObjectKeyFor(doc, sourcePath)
  const fileStat = imageFileStats.get(sourcePath) || await stat(sourcePath)
  const sha256 = await sha256File(sourcePath)

  if (seenKeys.has(objectKey)) {
    missing.push({
      appwriteDocumentId: doc.$id,
      certificateNo,
      imageValue,
      objectKey,
      error: `R2 object key collision with ${seenKeys.get(objectKey)}`,
    })
    continue
  }

  seenKeys.set(objectKey, doc.$id)
  uploads.push({
    appwriteDocumentId: doc.$id,
    certificateNo,
    appwriteFileId: imageValue,
    sourcePath: path.relative(repoRoot, sourcePath),
    r2ObjectKey: objectKey,
    bytes: fileStat.size,
    sha256,
  })
}

const manifest = {
  backupDir,
  generatedAt: new Date().toISOString(),
  cleanRows: docs.length,
  uploads: uploads.length,
  missing: missing.length,
  needsReviewUploads: uploads.filter((upload) =>
    upload.r2ObjectKey.startsWith('certificates/_needs-review/')
  ).length,
  uploadItems: uploads,
  missingItems: missing,
}

await writeFile(
  path.join(base, 'r2-upload-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
)

console.log(`Generated ${path.join(backupDir, 'r2-upload-manifest.json')}`)
console.log(`Upload items: ${uploads.length}`)
console.log(`Missing items: ${missing.length}`)

if (missing.length > 0) {
  process.exitCode = 1
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath))
    } else {
      files.push(fullPath)
    }
  }

  return files
}

function sourcePathFor(doc) {
  const certificateNo = String(doc.CERTIFICATE_NO)
  const imageValue = String(doc.Certificate_photograph)
  const storageFile = storageFilesById.get(imageValue)
  const candidates = []

  const byFileId = imageFilesByFileId.get(imageValue)
  if (byFileId) candidates.push(byFileId)

  const byCertificateName = imageFilesByCertificateName.get(certificateNo)
  if (byCertificateName) candidates.push(byCertificateName)

  for (const [filePath] of imageFileStats) {
    const baseName = path.basename(filePath).replace(/\.[^.]+$/, '')
    if (
      baseName === certificateNo ||
      baseName.startsWith(`${certificateNo}-`) ||
      baseName.startsWith(`${imageValue}-`)
    ) {
      candidates.push(filePath)
    }
  }

  if (storageFile?.sizeOriginal !== undefined && storageFile?.sizeOriginal !== null) {
    const sizeMatch = candidates.find((filePath) => {
      const fileStat = imageFileStats.get(filePath)
      return fileStat?.size === Number(storageFile.sizeOriginal)
    })
    if (sizeMatch) return sizeMatch
  }

  return candidates[0] || null
}

function r2ObjectKeyFor(doc, sourcePath) {
  const certificateNo = doc.CERTIFICATE_NO
  const extension = path.extname(sourcePath) || '.jpg'

  if ((certificateNumberCounts.get(certificateNo) || 0) > 1) {
    return `certificates/_needs-review/${safeObjectName(certificateNo)}-${safeObjectName(doc.$id)}${extension}`
  }

  return `certificates/${safeObjectName(certificateNo)}${extension}`
}

function safeObjectName(value) {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
}

function countBy(values) {
  const counts = new Map()
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return counts
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(await readFile(filePath))
  return hash.digest('hex')
}
