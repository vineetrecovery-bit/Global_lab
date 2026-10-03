import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'global_lab_admin_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILURES = 5
const LOGIN_LOCK_MS = 15 * 60 * 1000

type LoginAttempt = {
  count: number
  firstFailureAt: number
  lockedUntil: number
}

type AdminSession = {
  email: string
  exp: number
  nonce: string
  version: string
}

const loginAttempts = new Map<string, LoginAttempt>()
const revokedSessions = new Map<string, number>()

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
    if (!session.email || !session.exp || !session.nonce || !session.version) return null
    if (session.exp < Date.now()) return null
    if (session.email !== configuredAdminEmail()) return null
    if (session.version !== sessionVersion()) return null
    if (isSessionRevoked(session.nonce)) return null
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
  response.cookies.set(SESSION_COOKIE, createSessionToken(configuredAdminEmail()), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  })
  return response
}

export function clearAdminSessionResponse(request?: NextRequest) {
  if (request) revokeSessionFromRequest(request)
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
  const expectedEmail = configuredAdminEmail()
  if (email.trim().toLowerCase() !== expectedEmail) return false

  const passwordHash = requiredEnv('ADMIN_PASSWORD_HASH').trim()
  return verifyPasswordHash(password, passwordHash)
}

export function loginThrottleKey(request: NextRequest, email: string) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const client = forwardedFor || request.headers.get('x-real-ip') || 'unknown'
  return `${email.trim().toLowerCase()}:${client}`
}

export function isLoginThrottled(key: string) {
  const attempt = loginAttempts.get(key)
  if (!attempt) return false
  if (attempt.lockedUntil <= Date.now()) {
    loginAttempts.delete(key)
    return false
  }
  return true
}

export function recordLoginFailure(key: string) {
  const now = Date.now()
  const current = loginAttempts.get(key)
  const attempt =
    current && now - current.firstFailureAt <= LOGIN_WINDOW_MS
      ? current
      : { count: 0, firstFailureAt: now, lockedUntil: 0 }

  attempt.count += 1
  if (attempt.count >= LOGIN_MAX_FAILURES) {
    attempt.lockedUntil = now + LOGIN_LOCK_MS
  }
  loginAttempts.set(key, attempt)
}

export function recordLoginSuccess(key: string) {
  loginAttempts.delete(key)
}

export function resetAuthTestState() {
  loginAttempts.clear()
  revokedSessions.clear()
}

function createSessionToken(email: string) {
  const session: AdminSession = {
    email,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    nonce: randomBytes(16).toString('base64url'),
    version: sessionVersion(),
  }
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${signPayload(payload)}`
}

function signPayload(payload: string) {
  return createHmac('sha256', requiredEnv('SESSION_SECRET')).update(payload).digest('base64url')
}

function verifyPasswordHash(password: string, passwordHash: string) {
  if (passwordHash.startsWith('scrypt:')) {
    const [, salt, expected] = passwordHash.split(':')
    if (!salt || !expected) return false
    const actual = scryptSync(password, salt, expected.length / 2).toString('hex')
    return safeEqual(actual, expected)
  }

  throw new Error('ADMIN_PASSWORD_HASH must use scrypt:<salt>:<hex>')
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function configuredAdminEmail() {
  return requiredEnv('ADMIN_EMAIL').trim().toLowerCase()
}

function sessionVersion() {
  return createHash('sha256')
    .update(`${configuredAdminEmail()}:${requiredEnv('ADMIN_PASSWORD_HASH').trim()}`)
    .digest('hex')
}

function revokeSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return
  const [payloadPart, signaturePart] = token.split('.')
  if (!payloadPart || !signaturePart || !safeEqual(signaturePart, signPayload(payloadPart))) return

  try {
    const session = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as AdminSession
    if (session.nonce && session.exp) {
      revokedSessions.set(session.nonce, session.exp)
    }
  } catch {
    // Ignore malformed tokens while still clearing the browser cookie.
  }
}

function isSessionRevoked(nonce: string) {
  const exp = revokedSessions.get(nonce)
  if (!exp) return false
  if (exp < Date.now()) {
    revokedSessions.delete(nonce)
    return false
  }
  return true
}
