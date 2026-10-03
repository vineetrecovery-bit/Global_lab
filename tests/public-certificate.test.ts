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

  it('returns every populated public certificate field', () => {
    const certificate = toPublicCertificate(syntheticCertificateRow)

    expect(Object.keys(certificate)).toEqual([
      'CERTIFICATE_NO',
      'Certificate_photograph',
      'TYPE',
      'CATEGORY',
      'PRODUCT_NAME',
      'WEIGHT',
      'DIMENSIONS',
      'SHAPE',
      'CUT',
      'COLOR',
      'MATERIAL',
      'CONSTRUCTION',
      'ORIGIN',
      'TREATMENT',
      'COMMENTS',
      'CERTIFICATE_DATE',
      'BOTANICAL_NAME',
      'WOOD_TYPE',
      'MUKHI',
      'NATURAL_FACES',
      'ARTIFICIAL_FACES',
      'SURFACE_TEXTURE',
      'GEM_VARIETY',
      'TRANSPARENCY',
      'LUSTER',
    ])
  })

  it('omits public fields that have no data', () => {
    const certificate = toPublicCertificate({
      ...syntheticCertificateRow,
      DIMENSIONS: '   ',
      ORIGIN: null,
    })

    expect(certificate).not.toHaveProperty('DIMENSIONS')
    expect(certificate).not.toHaveProperty('ORIGIN')
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
