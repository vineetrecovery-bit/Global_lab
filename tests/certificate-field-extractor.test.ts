import { describe, expect, it } from 'vitest'
import {
  AUTOFILL_CONFIDENCE,
  extractCertificateFields,
  verifyCertificateNumber,
  type FieldKnowledge,
} from '@/lib/certificate-field-extractor'

const columns = [
  'CERTIFICATE_NO',
  'CERTIFICATE_DATE',
  'CATEGORY',
  'TYPE',
  'PRODUCT_NAME',
  'COLOR',
  'MUKHI',
  'ORIGIN',
  'BOTANICAL_NAME',
  'WEIGHT',
  'DIMENSIONS',
  'TREATMENT',
]

const repeat = (value: string, times: number) => Array.from({ length: times }, () => value)

// Synthetic existing records: nothing here is real certificate data.
const knowledge: FieldKnowledge = {
  values: {
    CERTIFICATE_NO: ['AB-CD-0010-001', 'AB-CD-0010-002', 'AB-EF-0011-003'],
    CERTIFICATE_DATE: [...repeat('02-08-2026', 4), '2026-07-23'],
    CATEGORY: ['Sampleware', 'Testite'],
    TYPE: ['Loose Beads', 'Bracelet'],
    PRODUCT_NAME: [...repeat('5 Mukhi Sampleware', 5), '5 Mukhi Sampleware ', '6 Mukhi Sampleware'],
    COLOR: ['Natural Brown', 'Deep Red'],
    MUKHI: ['5 Mukhi', '1 to 9 Mukhi'],
    ORIGIN: ['Nepal', 'NEPAL', 'Nepal', 'Indonesian'],
    BOTANICAL_NAME: ['Testus exemplaris'],
    WEIGHT: ['2.20 GMS', '3.10 GMS', '1.05 GMS', '320.00 CT', '4.00 GMS', '2.00 GMS'],
    DIMENSIONS: ['8-9 MM ( Approx)', '5-6 MM (Approx)'],
    TREATMENT: [...repeat('No Treatment', 24), 'No treatment'],
  },
}

function extract(text: string, overrides: Record<string, string[]> = {}) {
  return extractCertificateFields(text, columns, { values: { ...knowledge.values, ...overrides } }).fields
}

describe('extractCertificateFields', () => {
  it('reads label/value pairs and snaps them to the existing vocabulary and casing', () => {
    const fields = extract('Product Name: 5 Mukhi Sampleware\nColor: natural brown\nOrigin: NEPAL')

    expect(fields.PRODUCT_NAME.value).toBe('5 Mukhi Sampleware')
    expect(fields.COLOR.value).toBe('Natural Brown')
    expect(fields.ORIGIN.value).toBe('Nepal')
    expect(fields.COLOR.confidence).toBeGreaterThanOrEqual(AUTOFILL_CONFIDENCE)
  })

  it('does not depend on layout: labels can be reordered, split across lines or noisy', () => {
    const fields = extract('Color: Deep Red xy\nOrigin & Botanical: Nepal & Testus exemplaris Z\nLAB TESTED')

    expect(fields.COLOR.value).toBe('Deep Red')
    expect(fields.ORIGIN.value).toBe('Nepal')
    expect(fields.BOTANICAL_NAME.value).toBe('Testus exemplaris')
  })

  it('moves a value to the column whose vocabulary it matches when a design labels it differently', () => {
    const fields = extract('Product Type: 5 Mukhi')

    expect(fields.MUKHI?.value).toBe('5 Mukhi')
    expect(fields.TYPE?.confidence ?? 0).toBeLessThan(AUTOFILL_CONFIDENCE)
  })

  it('never fuzzy-matches digits: a different mukhi count is not an existing value', () => {
    const fields = extract('Product Name: 7 Mukhi Sampleware')

    expect(fields.PRODUCT_NAME.value).not.toBe('5 Mukhi Sampleware')
    expect(fields.PRODUCT_NAME.value).not.toBe('6 Mukhi Sampleware')
  })

  it('learns the certificate number shape and repairs common OCR digit/letter swaps', () => {
    const fields = extract('Batch\nAB-CD-OO12-O04 listed')

    expect(fields.CERTIFICATE_NO.value).toBe('AB-CD-0012-004')
    expect(fields.CERTIFICATE_NO.confidence).toBeGreaterThanOrEqual(AUTOFILL_CONFIDENCE)
  })

  it('does not auto-fill a certificate number that already exists', () => {
    const fields = extract('Batch No. AB-CD-0010-001')

    expect(fields.CERTIFICATE_NO.value).toBe('AB-CD-0010-001')
    expect(fields.CERTIFICATE_NO.confidence).toBeLessThan(AUTOFILL_CONFIDENCE)
    expect(fields.CERTIFICATE_NO.evidence).toMatch(/already exists/i)
  })

  it('writes dates in the style existing records use', () => {
    expect(extract('Issued on 12/11/2026').CERTIFICATE_DATE.value).toBe('12-11-2026')
    expect(extract('Issued on 12/11/2026', { CERTIFICATE_DATE: repeat('2026-07-23', 5) }).CERTIFICATE_DATE.value).toBe(
      '2026-11-12'
    )
  })

  it('removes trailing artwork debris and text after a closing parenthesis', () => {
    const fields = extract('Dimensions: 5-6 MM (Approx) QR Code linked Er 2\nWeight: 2.20 gms x')

    expect(fields.DIMENSIONS.value).toBe('5-6 MM (Approx)')
    expect(fields.WEIGHT.value).toBe('2.20 GMS')
  })

  it('ignores placeholder values such as N/A', () => {
    expect(extract('Weight: N/A').WEIGHT).toBeUndefined()
  })

  it('only suggests (below the auto-fill bar) when the certificate words a standard value differently', () => {
    const fields = extract('Treatment: No chemical or artificial treatment')

    expect(fields.TREATMENT.value).toBe('No Treatment')
    expect(fields.TREATMENT.confidence).toBeLessThan(AUTOFILL_CONFIDENCE)
  })

  it('returns nothing for text with no recognizable certificate content', () => {
    expect(extract('qwerty asdf zxcv')).toEqual({})
  })
})

describe('verifyCertificateNumber', () => {
  const known = knowledge.values.CERTIFICATE_NO

  it('matches when the certificate prints the row number, tolerating OCR letter/digit swaps', () => {
    expect(verifyCertificateNumber('Batch No. AB-CD-0010-001', 'AB-CD-0010-001', known)).toEqual({ status: 'match' })
    expect(verifyCertificateNumber('Batch No. AB-CD-OO10-OO1', 'AB-CD-0010-001', known)).toEqual({ status: 'match' })
  })

  it('reports a mismatch with the number found on the image', () => {
    expect(verifyCertificateNumber('Batch No. AB-EF-0011-003', 'AB-CD-0010-001', known)).toEqual({
      status: 'mismatch',
      found: 'AB-EF-0011-003',
    })
  })

  it('reports unreadable when no certificate number appears at all', () => {
    expect(verifyCertificateNumber('Color: Natural Brown', 'AB-CD-0010-001', known)).toEqual({ status: 'unreadable' })
    expect(verifyCertificateNumber('Batch No. AB-CD-0010-001', '', known)).toEqual({ status: 'unreadable' })
  })
})
