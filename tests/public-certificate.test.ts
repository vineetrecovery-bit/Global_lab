import { describe, expect, it } from 'vitest'
import { toPublicCertificate } from '@/lib/public-certificate'
import { syntheticCertificateRow } from '@/tests/fixtures/certificates'

describe('public certificate mapping', () => {
  it('maps the public image URL without exposing storage metadata', () => {
    const certificate = toPublicCertificate(syntheticCertificateRow)

    expect(certificate.Certificate_photograph).toBe('/api/certificates/TEST%2F42/image')
    expect(certificate).not.toHaveProperty('r2_object_key')
    expect(certificate).not.toHaveProperty('id')
    expect(certificate).not.toHaveProperty('created_at')
  })

  it('keeps an unknown database column private by default', () => {
    expect(toPublicCertificate(syntheticCertificateRow)).not.toHaveProperty('FUTURE_INTERNAL_NOTE')
  })

  it('adds a content version when updated_at is available', () => {
    const certificate = toPublicCertificate({
      ...syntheticCertificateRow,
      updated_at: new Date('2026-10-02T10:20:30.000Z'),
    })

    expect(certificate.Certificate_photograph).toBe(
      '/api/certificates/TEST%2F42/image?v=2026-10-02T10%3A20%3A30.000Z'
    )
  })
})
