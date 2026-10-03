import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/certificates/route'
import { PATCH } from '@/app/api/admin/certificates/[id]/route'
import { createAdminSessionResponse } from '@/lib/admin-auth'
import { createAdminCertificate, updateAdminCertificate } from '@/lib/admin-certificates'

vi.mock('@/lib/admin-certificates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin-certificates')>()
  return {
    ...actual,
    createAdminCertificate: vi.fn(),
    updateAdminCertificate: vi.fn(),
  }
})

const originalSessionSecret = process.env.SESSION_SECRET
const originalAdminEmail = process.env.ADMIN_EMAIL
const originalAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH
const scryptHash =
  'scrypt:synthetic-salt:1a11fe2a0b12b2726daa1959e89c570cd7ec94ad59de806e634956fbc9e0163f'

beforeEach(() => {
  process.env.SESSION_SECRET = 'synthetic-test-secret-not-used-outside-tests'
  process.env.ADMIN_EMAIL = 'admin@example.test'
  process.env.ADMIN_PASSWORD_HASH = scryptHash
})

afterEach(() => {
  vi.mocked(createAdminCertificate).mockReset()
  vi.mocked(updateAdminCertificate).mockReset()
  restoreEnv('SESSION_SECRET', originalSessionSecret)
  restoreEnv('ADMIN_EMAIL', originalAdminEmail)
  restoreEnv('ADMIN_PASSWORD_HASH', originalAdminPasswordHash)
  vi.restoreAllMocks()
})

describe('admin SQL error boundary', () => {
  it('does not expose unexpected create errors', async () => {
    const providerDetail = 'synthetic-mysql-create-detail-that-must-not-leak'
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(createAdminCertificate).mockRejectedValue(new Error(providerDetail))

    const response = await POST(authenticatedJsonRequest('/api/admin/certificates'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'Failed to create certificate',
      requestId: expect.any(String),
    })
    expect(response.headers.get('x-request-id')).toBe(body.requestId)
    expect(JSON.stringify(body)).not.toContain(providerDetail)
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(providerDetail)
  })

  it('does not expose unexpected update errors', async () => {
    const providerDetail = 'synthetic-mysql-update-detail-that-must-not-leak'
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(updateAdminCertificate).mockRejectedValue(new Error(providerDetail))

    const response = await PATCH(authenticatedJsonRequest('/api/admin/certificates/42'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'Failed to update certificate',
      requestId: expect.any(String),
    })
    expect(response.headers.get('x-request-id')).toBe(body.requestId)
    expect(JSON.stringify(body)).not.toContain(providerDetail)
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(providerDetail)
  })
})

function authenticatedJsonRequest(pathname: string) {
  const cookie = createAdminSessionResponse('admin@example.test')
    .headers.get('set-cookie')
    ?.split(';')[0]

  return new NextRequest(`http://localhost${pathname}`, {
    method: pathname.endsWith('/42') ? 'PATCH' : 'POST',
    headers: {
      cookie: cookie || '',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ CERTIFICATE_NO: 'TEST-42' }),
  })
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
