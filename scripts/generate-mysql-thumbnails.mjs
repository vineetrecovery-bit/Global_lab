#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')

const backupDir =
  process.env.MIGRATION_BACKUP_DIR ||
  'backups/appwrite/2026-09-19T21-08-58-219Z'
const base = path.join(repoRoot, backupDir)
const outputDir = path.join(base, 'thumbnails')
const maxSize = Number(process.env.THUMBNAIL_MAX_SIZE || 120)
const maxBytes = Number(process.env.THUMBNAIL_MAX_BYTES || 25000)

if (!Number.isInteger(maxSize) || maxSize < 40 || maxSize > 400) {
  throw new Error('THUMBNAIL_MAX_SIZE must be an integer between 40 and 400')
}

if (!Number.isInteger(maxBytes) || maxBytes < 5000) {
  throw new Error('THUMBNAIL_MAX_BYTES must be an integer >= 5000')
}

const docs = JSON.parse(await readFile(path.join(base, 'certificates.json'), 'utf8'))
const r2Manifest = JSON.parse(await readFile(path.join(base, 'r2-upload-manifest.json'), 'utf8'))
const uploadItems = r2Manifest.uploadItems || []
const uploadsByDocumentId = new Map(
  uploadItems.map((item) => [String(item.appwriteDocumentId), item])
)

await assertSipsAvailable()
await mkdir(outputDir, { recursive: true })

const items = []
const errors = []

for (const doc of docs) {
  const upload = uploadsByDocumentId.get(String(doc.$id))
  if (!upload) {
    errors.push(`No R2 manifest upload item for document ${doc.$id}`)
    continue
  }

  const sourcePath = path.join(repoRoot, upload.sourcePath)
  const thumbnailName = `${safeObjectName(doc.CERTIFICATE_NO)}-${safeObjectName(doc.$id)}.jpg`
  const thumbnailPath = path.join(outputDir, thumbnailName)

  await runSips([
    '-Z',
    String(maxSize),
    '-s',
    'format',
    'jpeg',
    '-s',
    'formatOptions',
    'normal',
    sourcePath,
    '--out',
    thumbnailPath,
  ])

  const fileStat = await stat(thumbnailPath)
  if (fileStat.size > maxBytes) {
    errors.push(
      `${path.relative(repoRoot, thumbnailPath)} is ${fileStat.size} bytes, above ${maxBytes}`
    )
  }

  const dimensions = await imageDimensions(thumbnailPath)
  items.push({
    appwriteDocumentId: doc.$id,
    certificateNo: doc.CERTIFICATE_NO,
    sourcePath: upload.sourcePath,
    thumbnailPath: path.relative(repoRoot, thumbnailPath),
    mime: 'image/jpeg',
    width: dimensions.width,
    height: dimensions.height,
    bytes: fileStat.size,
    sha256: await sha256File(thumbnailPath),
  })
}

const manifest = {
  backupDir,
  generatedAt: new Date().toISOString(),
  cleanRows: docs.length,
  thumbnailMaxSize: maxSize,
  thumbnailMaxBytes: maxBytes,
  thumbnails: items.length,
  thumbnailItems: items,
  errors,
}

await writeFile(
  path.join(base, 'thumbnail-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
)

console.log(`Generated ${path.join(backupDir, 'thumbnail-manifest.json')}`)
console.log(`Thumbnail items: ${items.length}`)
console.log(`Thumbnail max dimension: ${maxSize}px`)
console.log(`Thumbnail max bytes: ${maxBytes}`)

if (errors.length > 0) {
  console.error('\nThumbnail generation completed with errors:')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
}

async function assertSipsAvailable() {
  try {
    await runSips(['--version'])
  } catch {
    throw new Error(
      'The thumbnail generator requires macOS sips. Install sharp later if this must run on Linux.'
    )
  }
}

async function imageDimensions(filePath) {
  const output = await runSips(['-g', 'pixelWidth', '-g', 'pixelHeight', filePath])
  const widthMatch = output.match(/pixelWidth:\s*(\d+)/)
  const heightMatch = output.match(/pixelHeight:\s*(\d+)/)

  return {
    width: widthMatch ? Number(widthMatch[1]) : null,
    height: heightMatch ? Number(heightMatch[1]) : null,
  }
}

function runSips(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('sips', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []

    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8')
      const err = Buffer.concat(stderr).toString('utf8')
      if (code === 0) {
        resolve(`${out}${err}`)
      } else {
        reject(new Error(`sips failed with code ${code}: ${err || out}`))
      }
    })
  })
}

function safeObjectName(value) {
  return String(value || 'missing')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(await readFile(filePath))
  return hash.digest('hex')
}
