import { describe, expect, it } from 'vitest'
import { certificateVerificationUrl } from '@/lib/certificate-qr'

describe('certificateVerificationUrl', () => {
  it.each([
    ['GL-123', 'https://globallabtesting.in/?batch=GL-123'],
    ['TEST/42', 'https://globallabtesting.in/?batch=TEST%2F42'],
    ['A B&C?#', 'https://globallabtesting.in/?batch=A+B%26C%3F%23'],
  ])('creates a production verification link for %s', (certificateNo, expected) => {
    const result = certificateVerificationUrl(certificateNo)

    expect(result).toBe(expected)
    expect(new URL(result).searchParams.get('batch')).toBe(certificateNo)
  })
})
