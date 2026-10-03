import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import {
  clearAdminSessionResponse,
  createAdminSessionResponse,
  getAdminSession,
  isLoginThrottled,
  recordLoginFailure,
  resetAuthTestState,
  requireAdmin,
  verifyAdminCredentials,
} from '@/lib/admin-auth'

const originalSessionSecret = process.env.SESSION_SECRET
const originalAdminEmail = process.env.ADMIN_EMAIL
const originalAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH
const scryptHash =
  'scrypt:synthetic-salt:1a11fe2a0b12b2726daa1959e89c570cd7ec94ad59de806e634956fbc9e0163f'

afterEach(() => {
  resetAuthTestState()
  if (originalSessionSecret === undefined) {
    delete process.env.SESSION_SECRET
  } else {
    process.env.SESSION_SECRET = originalSessionSecret
  }
  if (originalAdminEmail === undefined) {
    delete process.env.ADMIN_EMAIL
  } else {
    process.env.ADMIN_EMAIL = originalAdminEmail
  }
  if (originalAdminPasswordHash === undefined) {
    delete process.env.ADMIN_PASSWORD_HASH
  } else {
    process.env.ADMIN_PASSWORD_HASH = originalAdminPasswordHash
  }
})

describe('admin session boundary', () => {
  it('rejects a request without an admin cookie', () => {
    const response = requireAdmin(new NextRequest('http://localhost/api/admin/certificates'))
    expect(response?.status).toBe(401)
  })

  it('accepts a session signed with a synthetic test secret', () => {
    setSyntheticAuthEnv()
    const response = createAdminSessionResponse('admin@example.test')
    const cookie = response.headers.get('set-cookie')?.split(';')[0]

    expect(cookie).toBeTruthy()
    const request = new NextRequest('http://localhost/api/admin/certificates', {
      headers: { cookie: cookie || '' },
    })
    expect(getAdminSession(request)).toEqual({ email: 'admin@example.test' })
  })

  it('rejects legacy SHA-256 password hashes', () => {
    setSyntheticAuthEnv()
    process.env.ADMIN_PASSWORD_HASH = 'sha256:a'.padEnd(71, '0')

    expect(() => verifyAdminCredentials('admin@example.test', 'password')).toThrow(
      'ADMIN_PASSWORD_HASH must use scrypt:<salt>:<hex>'
    )
  })

  it('verifies scrypt admin credentials', () => {
    setSyntheticAuthEnv()

    expect(verifyAdminCredentials('admin@example.test', 'password')).toBe(true)
    expect(verifyAdminCredentials('admin@example.test', 'wrong-password')).toBe(false)
  })

  it('invalidates existing sessions when the configured password hash changes', () => {
    setSyntheticAuthEnv()
    const response = createAdminSessionResponse('admin@example.test')
    const cookie = response.headers.get('set-cookie')?.split(';')[0] || ''
    const request = new NextRequest('http://localhost/api/admin/certificates', {
      headers: { cookie },
    })

    expect(getAdminSession(request)).toEqual({ email: 'admin@example.test' })
    process.env.ADMIN_PASSWORD_HASH =
      'scrypt:other-salt:33b540039c6781112145d17917316026251468823ab998108c3c93d59ce9e2b9'
    expect(getAdminSession(request)).toBeNull()
  })

  it('revokes the current token nonce on logout', () => {
    setSyntheticAuthEnv()
    const response = createAdminSessionResponse('admin@example.test')
    const cookie = response.headers.get('set-cookie')?.split(';')[0] || ''
    const request = new NextRequest('http://localhost/api/admin/certificates', {
      headers: { cookie },
    })

    expect(getAdminSession(request)).toEqual({ email: 'admin@example.test' })
    clearAdminSessionResponse(request)
    expect(getAdminSession(request)).toBeNull()
  })

  it('throttles repeated login failures for the same key', () => {
    setSyntheticAuthEnv()
    const key = 'admin@example.test:127.0.0.1'

    for (let i = 0; i < 5; i++) {
      recordLoginFailure(key)
    }

    expect(isLoginThrottled(key)).toBe(true)
  })
})

function setSyntheticAuthEnv() {
  process.env.SESSION_SECRET = 'synthetic-test-secret-not-used-outside-tests'
  process.env.ADMIN_EMAIL = 'admin@example.test'
  process.env.ADMIN_PASSWORD_HASH = scryptHash
}
