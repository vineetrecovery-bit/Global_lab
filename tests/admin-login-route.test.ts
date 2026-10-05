import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/auth/login/route'
import { resetAuthTestState } from '@/lib/admin-auth'
import { runtimeLog } from '@/lib/runtime-log'

vi.mock('@/lib/runtime-log', () => ({
  runtimeLog: vi.fn(),
}))

const originalSessionSecret = process.env.SESSION_SECRET
const originalAdminEmail = process.env.ADMIN_EMAIL
const originalAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH
const scryptHash =
  'scrypt:synthetic-salt:1a11fe2a0b12b2726daa1959e89c570cd7ec94ad59de806e634956fbc9e0163f'

beforeEach(() => {
  process.env.SESSION_SECRET = 'synthetic-test-secret-not-used-outside-tests'
  process.env.ADMIN_EMAIL = 'admin@example.test'
  process.env.ADMIN_PASSWORD_HASH = scryptHash
  vi.mocked(runtimeLog).mockReset()
})

afterEach(() => {
  resetAuthTestState()
  restoreEnv('SESSION_SECRET', originalSessionSecret)
  restoreEnv('ADMIN_EMAIL', originalAdminEmail)
  restoreEnv('ADMIN_PASSWORD_HASH', originalAdminPasswordHash)
})

describe('admin login runtime events', () => {
  it('logs a successful login without the account identifier', async () => {
    const response = await POST(loginRequest('admin@example.test', 'password'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(runtimeLog).toHaveBeenCalledWith(
      'auth.login',
      expect.objectContaining({ outcome: 'success', durationMs: expect.any(Number) })
    )
    expect(JSON.stringify(vi.mocked(runtimeLog).mock.calls)).not.toContain('admin@example.test')
    expect(JSON.stringify(vi.mocked(runtimeLog).mock.calls)).not.toContain('password')
  })

  it('logs a rejected login without credentials', async () => {
    const response = await POST(loginRequest('admin@example.test', 'wrong-password'))

    expect(response.status).toBe(401)
    expect(runtimeLog).toHaveBeenCalledWith(
      'auth.login',
      expect.objectContaining({ outcome: 'rejected', durationMs: expect.any(Number) }),
      'warn'
    )
    expect(JSON.stringify(vi.mocked(runtimeLog).mock.calls)).not.toContain('wrong-password')
  })
})

function loginRequest(email: string, password: string) {
  return new NextRequest('http://localhost/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
