import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/certificates/[certificateNo]/image/route'
import { getMysqlPool } from '@/lib/mysql'
import { fetchR2Object } from '@/lib/r2'

vi.mock('@/lib/mysql', () => ({
  getMysqlPool: vi.fn(),
}))

vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>()
  return {
    ...actual,
    fetchR2Object: vi.fn(),
  }
})

describe('public certificate image route headers', () => {
  beforeEach(() => {
    vi.mocked(getMysqlPool).mockReset()
    vi.mocked(fetchR2Object).mockReset()
  })

  it('serves unversioned stored objects with conservative cache headers', async () => {
    vi.mocked(getMysqlPool).mockReturnValue({
      execute: vi.fn().mockResolvedValue([[{ r2_object_key: 'certificates/test.jpg' }]]),
    } as never)
    vi.mocked(fetchR2Object).mockResolvedValue(
      new Response('not really a jpeg', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    )

    const response = await GET(
      new NextRequest('http://localhost/api/certificates/TEST-42/image')
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('content-disposition')).toBe('inline')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    'v=2026-10-02',
    'v=arbitrary-unverified-value',
    'v=',
  ])('does not grant immutable caching for an unverified query parameter: %s', async (query) => {
    vi.mocked(getMysqlPool).mockReturnValue({
      execute: vi.fn().mockResolvedValue([[{ r2_object_key: 'certificates/test.jpg' }]]),
    } as never)
    vi.mocked(fetchR2Object).mockResolvedValue(new Response('jpeg', { status: 200 }))

    const response = await GET(
      new NextRequest(`http://localhost/api/certificates/TEST-42/image?${query}`)
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('cache-control')).not.toContain('immutable')
  })

  it('distinguishes upstream R2 failures from missing images', async () => {
    vi.mocked(getMysqlPool).mockReturnValue({
      execute: vi.fn().mockResolvedValue([[{ r2_object_key: 'certificates/test.jpg' }]]),
    } as never)
    vi.mocked(fetchR2Object).mockResolvedValue(new Response('', { status: 503 }))

    const response = await GET(
      new NextRequest('http://localhost/api/certificates/TEST-42/image')
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Image service is temporarily unavailable',
    })
    expect(response.headers.get('x-request-id')).toBeTruthy()
  })

  it('reports duplicate certificate image lookups as conflicts', async () => {
    vi.mocked(getMysqlPool).mockReturnValue({
      execute: vi.fn().mockResolvedValue([[
        { r2_object_key: 'certificates/one.jpg' },
        { r2_object_key: 'certificates/two.jpg' },
      ]]),
    } as never)

    const response = await GET(
      new NextRequest('http://localhost/api/certificates/TEST-42/image')
    )

    expect(response.status).toBe(409)
    expect(fetchR2Object).not.toHaveBeenCalled()
  })
})
