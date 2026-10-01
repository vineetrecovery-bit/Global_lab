import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'global_lab_admin_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

type AdminSession = {
  email: string
  exp: number
  nonce: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function adminCookieName() {
  return SESSION_COOKIE
}

export function getAdminSession(request: NextRequest): { email: string } | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null

  const [payloadPart, signaturePart] = token.split('.')
  if (!payloadPart || !signaturePart) return null

  const expectedSignature = signPayload(payloadPart)
  if (!safeEqual(signaturePart, expectedSignature)) return null

  try {
    const session = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as AdminSession
    if (!session.email || !session.exp || session.exp < Date.now()) return null
    return { email: session.email }
  } catch {
    return null
  }
}

export function requireAdmin(request: NextRequest): NextResponse | null {
  if (getAdminSession(request)) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function createAdminSessionResponse(email: string) {
  const response = NextResponse.json({ user: { email } })
  response.cookies.set(SESSION_COOKIE, createSessionToken(email), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  })
  return response
}

export function clearAdminSessionResponse() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  })
  return response
}

export function verifyAdminCredentials(email: string, password: string) {
  const expectedEmail = requiredEnv('ADMIN_EMAIL').trim().toLowerCase()
  if (email.trim().toLowerCase() !== expectedEmail) return false

  const passwordHash = requiredEnv('ADMIN_PASSWORD_HASH').trim()
  return verifyPasswordHash(password, passwordHash)
}

function createSessionToken(email: string) {
  const session: AdminSession = {
    email,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    nonce: randomBytes(16).toString('base64url'),
  }
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${signPayload(payload)}`
}

function signPayload(payload: string) {
  return createHmac('sha256', requiredEnv('SESSION_SECRET')).update(payload).digest('base64url')
}

function verifyPasswordHash(password: string, passwordHash: string) {
  if (passwordHash.startsWith('sha256:')) {
    return safeEqual(sha256(password), passwordHash.slice('sha256:'.length))
  }

  if (/^[a-f0-9]{64}$/i.test(passwordHash)) {
    return safeEqual(sha256(password), passwordHash)
  }

  if (passwordHash.startsWith('scrypt:')) {
    const [, salt, expected] = passwordHash.split(':')
    if (!salt || !expected) return false
    const actual = scryptSync(password, salt, expected.length / 2).toString('hex')
    return safeEqual(actual, expected)
  }

  throw new Error('ADMIN_PASSWORD_HASH must be sha256:<hex>, <hex>, or scrypt:<salt>:<hex>')
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
