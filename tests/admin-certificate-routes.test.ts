import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/certificates/route'
import { PATCH } from '@/app/api/admin/certificates/[id]/route'
import { createAdminSessionResponse } from '@/lib/admin-auth'
import { getMysqlPool } from '@/lib/mysql'

vi.mock('@/lib/mysql', () => ({
  getMysqlPool: vi.fn(),
}))

const originalSessionSecret = process.env.SESSION_SECRET
const originalAdminEmail = process.env.ADMIN_EMAIL
const originalAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH
const scryptHash =
  'scrypt:synthetic-salt:1a11fe2a0b12b2726daa1959e89c570cd7ec94ad59de806e634956fbc9e0163f'

afterEach(() => {
  vi.mocked(getMysqlPool).mockReset()
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

describe('admin certificate route errors', () => {
  it('maps invalid mutation input to 400', async () => {
    const connection = mockConnection()
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
    ]])
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    const response = await POST(authenticatedJsonRequest(
      'http://localhost/api/admin/certificates',
      { CERTIFICATE_NO: 'TEST-42', appwrite_document_id: 'forged' }
    ))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'appwrite_document_id cannot be written by clients',
    })
  })

  it('maps a missing update target to 404', async () => {
    const connection = mockConnection()
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
    ]])
    connection.execute = vi.fn().mockResolvedValue([{ affectedRows: 0 }])
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    const response = await PATCH(authenticatedJsonRequest(
      'http://localhost/api/admin/certificates/999',
      { CERTIFICATE_NO: 'TEST-42' }
    ))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Certificate not found' })
  })
})

function authenticatedJsonRequest(url: string, body: Record<string, unknown>) {
  process.env.SESSION_SECRET = 'synthetic-test-secret-not-used-outside-tests'
  process.env.ADMIN_EMAIL = 'admin@example.test'
  process.env.ADMIN_PASSWORD_HASH = scryptHash
  const cookie = createAdminSessionResponse('admin@example.test')
    .headers.get('set-cookie')
    ?.split(';')[0]

  return new NextRequest(url, {
    method: 'POST',
    headers: {
      cookie: cookie || '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function mockConnection() {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn().mockResolvedValue([[]]),
    query: vi.fn().mockResolvedValue([[]]),
  }
}
