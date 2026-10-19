import { afterEach, describe, expect, it, vi } from 'vitest'
import { findCertificate } from '@/lib/certificates'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('certificate verification client', () => {
  it.each([
    [400, 'invalid'],
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [409, 'conflict'],
    [503, 'unavailable'],
  ] as const)('preserves HTTP %i as %s', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))

    await expect(findCertificate('TEST-42')).rejects.toMatchObject({ kind })
  })

  it('keeps a missing certificate distinct from a service failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    await expect(findCertificate('TEST-42')).resolves.toBeNull()
  })
})
