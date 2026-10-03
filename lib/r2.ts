import { createHash, createHmac } from 'node:crypto'
import path from 'node:path'

type SignedGetOptions = {
  objectKey: string
}

type PutObjectOptions = {
  objectKey: string
  body: Buffer | Uint8Array | ArrayBuffer
  contentType: string
}

const R2_TIMEOUT_MS = 10_000

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export async function fetchR2Object({ objectKey }: SignedGetOptions): Promise<Response> {
  const bucket = requiredEnv('R2_BUCKET')
  const endpoint = r2Endpoint()
  const objectPath = `/${bucket}/${encodeObjectKey(objectKey)}`
  const url = `${endpoint.origin}${objectPath}`
  const payloadHash = sha256Hex('')

  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(R2_TIMEOUT_MS),
    headers: signedGetHeaders({
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
      host: endpoint.host,
      canonicalUri: objectPath,
      payloadHash,
    }),
  })

  return response
}

export async function putR2Object({ objectKey, body, contentType }: PutObjectOptions): Promise<Response> {
  const bucket = requiredEnv('R2_BUCKET')
  const endpoint = r2Endpoint()
  const objectPath = `/${bucket}/${encodeObjectKey(objectKey)}`
  const url = `${endpoint.origin}${objectPath}`
  const bodyBuffer = body instanceof ArrayBuffer ? Buffer.from(body) : Buffer.from(body)
  const payloadHash = sha256BufferHex(bodyBuffer)

  return fetch(url, {
    method: 'PUT',
    signal: AbortSignal.timeout(R2_TIMEOUT_MS),
    headers: signedPutHeaders({
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
      host: endpoint.host,
      canonicalUri: objectPath,
      payloadHash,
      contentType,
    }),
    body: bodyBuffer,
  })
}

export function contentTypeForObjectKey(objectKey: string): string {
  const ext = path.extname(objectKey).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.pdf') return 'application/pdf'
  return 'image/jpeg'
}

function r2Endpoint(): URL {
  if (process.env.R2_ENDPOINT) {
    return new URL(process.env.R2_ENDPOINT)
  }

  const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID')
  return new URL(`https://${accountId}.r2.cloudflarestorage.com`)
}

function signedGetHeaders({
  accessKeyId,
  secretAccessKey,
  host,
  canonicalUri,
  payloadHash,
}: {
  accessKeyId: string
  secretAccessKey: string
  host: string
  canonicalUri: string
  payloadHash: string
}) {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n')
  const canonicalRequest = [
    'GET',
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
    Host: host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
}

function signedPutHeaders({
  accessKeyId,
  secretAccessKey,
  host,
  canonicalUri,
  payloadHash,
  contentType,
}: {
  accessKeyId: string
  secretAccessKey: string
  host: string
  canonicalUri: string
  payloadHash: string
  contentType: string
}) {
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

function getSignatureKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const kDate = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmacBuffer(kDate, region)
  const kService = hmacBuffer(kRegion, service)
  return hmacBuffer(kService, 'aws4_request')
}

function hmacBuffer(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest()
}

function hmacHex(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest('hex')
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function sha256BufferHex(value: Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function encodeObjectKey(key: string) {
  return String(key)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}
