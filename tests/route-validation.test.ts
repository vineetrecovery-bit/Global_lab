import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/certificates/verify/route'
import { getMysqlPool } from '@/lib/mysql'
import { runtimeLog } from '@/lib/runtime-log'
import { syntheticCertificateRow } from '@/tests/fixtures/certificates'

vi.mock('@/lib/mysql', () => ({
  getMysqlPool: vi.fn(),
}))

vi.mock('@/lib/runtime-log', () => ({
  runtimeLog: vi.fn(),
}))

describe('certificate verification route validation', () => {
  beforeEach(() => {
    vi.mocked(getMysqlPool).mockReset()
    vi.mocked(runtimeLog).mockReset()
  })

  it('rejects a missing certificate number without database credentials', async () => {
    const response = await GET(new NextRequest('http://localhost/api/certificates/verify'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Certificate number required' })
    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(runtimeLog).toHaveBeenCalledWith(
      'certificate.verify',
      expect.objectContaining({ outcome: 'invalid_request' }),
      'warn'
    )
  })

  it('reports duplicate certificate numbers as conflicts', async () => {
    vi.mocked(getMysqlPool).mockReturnValue({
      execute: vi.fn().mockResolvedValue([[
        { CERTIFICATE_NO: 'TEST-42', r2_object_key: null },
        { CERTIFICATE_NO: 'TEST-42', r2_object_key: null },
      ]]),
    } as never)

    const response = await GET(
      new NextRequest('http://localhost/api/certificates/verify?certificateNo=TEST-42')
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Certificate number is not unique',
    })
    expect(runtimeLog).toHaveBeenCalledWith(
      'certificate.verify',
      expect.objectContaining({ certificateNo: 'TEST-42', outcome: 'duplicate' }),
      'warn'
    )
  })

  it('logs useful verification stats without certificate values', async () => {
    vi.mocked(getMysqlPool).mockReturnValue({
      execute: vi.fn().mockResolvedValue([[syntheticCertificateRow]]),
    } as never)

    const response = await GET(
      new NextRequest('http://localhost/api/certificates/verify?certificateNo=TEST%2F42')
    )

    expect(response.status).toBe(200)
    expect(runtimeLog).toHaveBeenCalledWith(
      'certificate.verify',
      expect.objectContaining({
        certificateNo: 'TEST/42',
        outcome: 'verified',
        verifiedFieldCount: 23,
        verifiedFields: expect.arrayContaining(['TYPE', 'PRODUCT_NAME', 'CERTIFICATE_DATE']),
        hasImage: true,
        durationMs: expect.any(Number),
      })
    )

    const loggedDetails = vi.mocked(runtimeLog).mock.calls[0][1]
    expect(JSON.stringify(loggedDetails)).not.toContain('Synthetic specimen')
    expect(JSON.stringify(loggedDetails)).not.toContain('certificates/private-test.jpg')
  })
})
