import { createHmac, timingSafeEqual } from 'node:crypto'

const UPLOAD_TOKEN_MAX_AGE_MS = 60 * 60 * 1000

export function createUploadAttachmentToken(objectKey: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ objectKey, iat: now })).toString('base64url')
  return `${payload}.${signUploadPayload(payload)}`
}

export function verifyUploadAttachmentToken(objectKey: string, token: string, now = Date.now()) {
  const [payloadPart, signaturePart] = token.split('.')
  if (!payloadPart || !signaturePart) return false
  if (!safeEqual(signaturePart, signUploadPayload(payloadPart))) return false

  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as {
      objectKey?: unknown
      iat?: unknown
    }
    if (payload.objectKey !== objectKey) return false
    if (typeof payload.iat !== 'number') return false
    if (payload.iat > now) return false
    return now - payload.iat <= UPLOAD_TOKEN_MAX_AGE_MS
  } catch {
    return false
  }
}

function signUploadPayload(payload: string) {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error('Missing required environment variable: SESSION_SECRET')
  }
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
