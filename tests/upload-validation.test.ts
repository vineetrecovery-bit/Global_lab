import { describe, expect, it } from 'vitest'
import { validateUploadBytes } from '@/lib/upload-validation'

describe('upload validation', () => {
  it('accepts a PNG when MIME, extension and signature agree', () => {
    expect(validateUploadBytes(png(16, 12), 'image/png', 'certificate.png')).toEqual({
      contentType: 'image/png',
      extension: '.png',
      width: 16,
      height: 12,
    })
  })

  it('rejects active content before persistence', () => {
    expect(() =>
      validateUploadBytes(Buffer.from('<script>alert(1)</script>'), 'text/html', 'certificate.html')
    ).toThrow('Unsupported image file')
  })

  it('rejects mismatched MIME declarations', () => {
    expect(() => validateUploadBytes(png(1, 1), 'image/jpeg', 'certificate.png')).toThrow(
      'Image MIME type does not match file content'
    )
  })

  it('rejects mismatched file extensions', () => {
    expect(() => validateUploadBytes(png(1, 1), 'image/png', 'certificate.jpg')).toThrow(
      'Image extension does not match file content'
    )
  })

  it('rejects oversized images by metadata dimensions', () => {
    expect(() => validateUploadBytes(png(8001, 1), 'image/png', 'certificate.png')).toThrow(
      'Image dimensions are out of range'
    )
  })
})

function png(width: number, height: number) {
  const body = Buffer.alloc(24)
  body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  body.writeUInt32BE(13, 8)
  body.write('IHDR', 12, 'ascii')
  body.writeUInt32BE(width, 16)
  body.writeUInt32BE(height, 20)
  return body
}
