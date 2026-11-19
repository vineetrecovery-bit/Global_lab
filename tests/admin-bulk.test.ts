import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import {
  buildCertificateImagesZip,
  bulkFixCertificateQrs,
  certificateImageFileName,
  NoCertificateImagesError,
  type BulkDocument,
} from '@/lib/admin-bulk'

const withImage = (id: string, no: string): BulkDocument => ({
  $id: id,
  CERTIFICATE_NO: no,
  $revision: `rev-${id}`,
  $imageUrl: `/api/certificates/${no}/image`,
})
const withoutImage = (id: string, no: string): BulkDocument => ({ $id: id, CERTIFICATE_NO: no, $imageUrl: '' })

describe('bulkFixCertificateQrs', () => {
  it('applies the fix only to rows with a number and image and classifies results', async () => {
    const calls: { id: string; revision?: string }[] = []
    const summary = await bulkFixCertificateQrs(
      [withImage('1', 'TEST-1'), withoutImage('2', 'TEST-2'), withImage('3', 'TEST-3'), withImage('4', 'TEST-4'), { $id: '5', $imageUrl: '/x' }],
      async (id, options) => {
        calls.push({ id, revision: options.expectedRevision })
        expect(options.mode).toBe('apply')
        if (id === '3') return { status: 'already_correct' }
        if (id === '4') throw new Error('QR not found')
        return { status: 'applied' }
      }
    )

    expect(calls).toEqual([
      { id: '1', revision: 'rev-1' },
      { id: '3', revision: 'rev-3' },
      { id: '4', revision: 'rev-4' },
    ])
    expect(summary.fixed).toEqual(['TEST-1'])
    expect(summary.alreadyCorrect).toEqual(['TEST-3'])
    expect(summary.skipped).toEqual(['TEST-2', 'row 5'])
    expect(summary.failed).toEqual([{ certificateNo: 'TEST-4', message: 'QR not found' }])
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      bulkFixCertificateQrs([withImage('1', 'TEST-1')], async () => ({ status: 'applied' }), { signal: controller.signal })
    ).rejects.toThrow('Aborted')
  })
})

describe('buildCertificateImagesZip', () => {
  const image = (type: string) =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': type } })

  it('zips images of selected rows and ignores rows without one', async () => {
    const fetched: string[] = []
    const result = await buildCertificateImagesZip(
      [withImage('1', 'TEST/1'), withoutImage('2', 'TEST-2'), withImage('3', 'TEST-3')],
      async (url) => {
        fetched.push(url)
        return image(url.includes('TEST-3') ? 'image/png' : 'image/jpeg')
      }
    )

    expect(fetched).toHaveLength(2)
    expect(result.added).toBe(2)
    expect(result.skipped).toEqual(['TEST-2'])
    expect(Object.keys(unzipSync(result.zip)).sort()).toEqual(['certificate-TEST-1.jpg', 'certificate-TEST-3.png'])
  })

  it('reports per-row download failures but keeps the rest', async () => {
    const result = await buildCertificateImagesZip(
      [withImage('1', 'TEST-1'), withImage('2', 'TEST-2')],
      async (url) => (url.includes('TEST-2') ? new Response('', { status: 404 }) : image('image/jpeg'))
    )
    expect(result.added).toBe(1)
    expect(result.failed).toEqual([{ certificateNo: 'TEST-2', message: 'Image not found' }])
  })

  it('errors with "no photo selected" when no selected row has an image', async () => {
    await expect(
      buildCertificateImagesZip([withoutImage('1', 'TEST-1')], async () => image('image/jpeg'))
    ).rejects.toThrow(NoCertificateImagesError)
    await expect(
      buildCertificateImagesZip([withoutImage('1', 'TEST-1')], async () => image('image/jpeg'))
    ).rejects.toThrow(/No photo selected/)
  })

  it('errors when every image download fails', async () => {
    await expect(
      buildCertificateImagesZip([withImage('1', 'TEST-1')], async () => new Response('', { status: 502 }))
    ).rejects.toThrow(NoCertificateImagesError)
  })
})

describe('certificateImageFileName', () => {
  it('disambiguates names that collide after sanitizing', () => {
    const used = new Set<string>()
    expect(certificateImageFileName('A/1', 'image/jpeg', '1', used)).toBe('certificate-A-1.jpg')
    expect(certificateImageFileName('a 1', 'image/jpeg', '2', used)).toBe('certificate-a-1-2.jpg')
    expect(certificateImageFileName('B', 'application/pdf', '3', used)).toBe('certificate-B.pdf')
  })
})
