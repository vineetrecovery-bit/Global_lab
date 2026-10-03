import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/upload/route'
import { createAdminSessionResponse } from '@/lib/admin-auth'
import { putR2Object } from '@/lib/r2'
import { verifyUploadAttachmentToken } from '@/lib/upload-attachment'

vi.mock('@/lib/r2', () => ({
  putR2Object: vi.fn(),
}))

const originalSessionSecret = process.env.SESSION_SECRET
const originalAdminEmail = process.env.ADMIN_EMAIL
const originalAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH
const scryptHash =
  'scrypt:synthetic-salt:1a11fe2a0b12b2726daa1959e89c570cd7ec94ad59de806e634956fbc9e0163f'

afterEach(() => {
  vi.mocked(putR2Object).mockReset()
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

describe('admin upload route validation', () => {
  it('returns a signed attachment token for a valid upload', async () => {
    setSyntheticAuthEnv()
    vi.mocked(putR2Object).mockResolvedValue(new Response('', { status: 200 }))
    const formData = new FormData()
    formData.append(
      'file',
      new File([png(1, 1)], 'certificate.png', { type: 'image/png' })
    )
    formData.append('certificateNo', 'TEST-42')

    const response = await POST(authenticatedUploadRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.objectKey).toMatch(/^certificates\/TEST-42-[0-9a-f-]{36}\.png$/)
    expect(verifyUploadAttachmentToken(body.objectKey, body.attachmentToken)).toBe(true)
  })

  it('rejects active content before storage', async () => {
    setSyntheticAuthEnv()
    const formData = new FormData()
    formData.append(
      'file',
      new File([Buffer.from('<script>alert(1)</script>')], 'certificate.html', {
        type: 'text/html',
      })
    )
    formData.append('certificateNo', 'TEST-42')

    const response = await POST(authenticatedUploadRequest(formData))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Unsupported image file' })
    expect(putR2Object).not.toHaveBeenCalled()
  })
})

function authenticatedUploadRequest(formData: FormData) {
  const cookie = createAdminSessionResponse('admin@example.test')
    .headers.get('set-cookie')
    ?.split(';')[0]

  return new NextRequest('http://localhost/api/admin/upload', {
      method: 'POST',
      headers: { cookie: cookie || '' },
      body: formData,
  })
}

function setSyntheticAuthEnv() {
  process.env.SESSION_SECRET = 'synthetic-test-secret-not-used-outside-tests'
  process.env.ADMIN_EMAIL = 'admin@example.test'
  process.env.ADMIN_PASSWORD_HASH = scryptHash
}

function png(width: number, height: number) {
  const body = Buffer.alloc(24)
  body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  body.writeUInt32BE(13, 8)
  body.write('IHDR', 12, 'ascii')
  body.writeUInt32BE(width, 16)
  body.writeUInt32BE(height, 20)
  return body
}
