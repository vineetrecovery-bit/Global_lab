#!/usr/bin/env node

import { createHash, createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')
const backupDir =
  process.env.MIGRATION_BACKUP_DIR ||
  'backups/appwrite/2026-09-19T21-08-58-219Z'
const manifestPath = path.join(repoRoot, backupDir, 'r2-upload-manifest.json')
const dryRun = process.env.R2_DRY_RUN === '1' || process.argv.includes('--dry-run')

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const uploadItems = manifest.uploadItems || []

if (manifest.missingItems?.length) {
  throw new Error(`Manifest has ${manifest.missingItems.length} missing item(s); refusing upload.`)
}

if (dryRun) {
  console.log(`Dry run: ${uploadItems.length} file(s) ready for R2 upload.`)
  console.log(`Backup: ${backupDir}`)
  console.log(`First object: ${uploadItems[0]?.r2ObjectKey || 'none'}`)
  process.exit(0)
}

const requiredEnv = [
  'CLOUDFLARE_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
]
const missingEnv = requiredEnv.filter((key) => !process.env[key])
if (missingEnv.length) {
  throw new Error(`Missing required env variable(s): ${missingEnv.join(', ')}`)
}

if (process.env.R2_UPLOAD_CONFIRM !== 'upload') {
  throw new Error('Set R2_UPLOAD_CONFIRM=upload to perform the real upload.')
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET
const endpointHost = `${accountId}.r2.cloudflarestorage.com`
const endpointBaseUrl = `https://${endpointHost}`

let uploaded = 0
for (const item of uploadItems) {
  const sourcePath = path.join(repoRoot, item.sourcePath)
  const body = await readFile(sourcePath)
  const actualSha256 = sha256Hex(body)

  if (actualSha256 !== item.sha256) {
    throw new Error(`SHA mismatch before upload: ${item.sourcePath}`)
  }

  const objectPath = `/${bucket}/${encodeObjectKey(item.r2ObjectKey)}`
  const url = `${endpointBaseUrl}${objectPath}`
  const headers = signedPutHeaders({
    accessKeyId,
    secretAccessKey,
    host: endpointHost,
    canonicalUri: objectPath,
    payloadHash: actualSha256,
    contentType: contentTypeFor(item.r2ObjectKey),
  })

  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Upload failed for ${item.r2ObjectKey}: ${response.status} ${response.statusText}\n${text}`
    )
  }

  uploaded += 1
  if (uploaded % 25 === 0 || uploaded === uploadItems.length) {
    console.log(`Uploaded ${uploaded}/${uploadItems.length}`)
  }
}

console.log(`Uploaded ${uploaded} file(s) to R2 bucket ${bucket}.`)

function signedPutHeaders({ accessKeyId, secretAccessKey, host, canonicalUri, payloadHash, contentType }) {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n')
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service)
  const signature = hmacHex(signingKey, stringToSign)

  return {
    Authorization: `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'Content-Type': contentType,
    Host: host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
}

function getSignatureKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmacBuffer(kDate, region)
  const kService = hmacBuffer(kRegion, service)
  return hmacBuffer(kService, 'aws4_request')
}

function hmacBuffer(key, value) {
  return createHmac('sha256', key).update(value).digest()
}

function hmacHex(key, value) {
  return createHmac('sha256', key).update(value).digest('hex')
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

function encodeObjectKey(key) {
  return String(key)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function contentTypeFor(objectKey) {
  const ext = path.extname(objectKey).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.pdf') return 'application/pdf'
  return 'image/jpeg'
}
