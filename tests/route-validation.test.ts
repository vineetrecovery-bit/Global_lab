import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/certificates/verify/route'
import { getMysqlPool } from '@/lib/mysql'

vi.mock('@/lib/mysql', () => ({
  getMysqlPool: vi.fn(),
}))

describe('certificate verification route validation', () => {
  beforeEach(() => {
    vi.mocked(getMysqlPool).mockReset()
  })

  it('rejects a missing certificate number without database credentials', async () => {
    const response = await GET(new NextRequest('http://localhost/api/certificates/verify'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Certificate number required' })
    expect(response.headers.get('x-request-id')).toBeTruthy()
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
  })
})
