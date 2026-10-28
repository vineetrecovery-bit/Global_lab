import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import {
  buildExportZip,
  fetchAllDocuments,
  uniqueQrFileName,
  type ExportDocument,
} from '@/lib/admin-export'
import { parseCSV } from '@/lib/csv'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

function syntheticDocs(count: number, offset = 0): ExportDocument[] {
  return Array.from({ length: count }, (_, index) => ({
    $id: String(offset + index + 1),
    CERTIFICATE_NO: `TEST-${offset + index + 1}`,
    PRODUCT_NAME: 'Synthetic product',
  }))
}

describe('fetchAllDocuments', () => {
  it('reads every page until a short page is returned', async () => {
    const all = syntheticDocs(230)
    const requested: number[] = []

    const result = await fetchAllDocuments(async (page, pageSize) => {
      requested.push(page)
      return { documents: all.slice((page - 1) * pageSize, page * pageSize), total: all.length }
    })

    expect(requested).toEqual([1, 2, 3])
    expect(result.documents).toHaveLength(230)
    expect(result.changedDuringExport).toBe(false)
  })

  it('removes duplicates and flags a total that changed mid-export', async () => {
    const pages = [
      { documents: syntheticDocs(100), total: 150 },
      // A row inserted at the top shifts the last row of page 1 onto page 2.
      { documents: syntheticDocs(51, 99), total: 151 },
    ]

    const result = await fetchAllDocuments(async (page) => pages[page - 1])

    expect(result.documents).toHaveLength(150)
    expect(result.changedDuringExport).toBe(true)
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      fetchAllDocuments(async () => ({ documents: [], total: 0 }), { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('uniqueQrFileName', () => {
  it('adds the row id when sanitized names collide, ignoring case', () => {
    const used = new Set<string>()

    expect(uniqueQrFileName('A/1', '10', used)).toBe('certificate-A-1.png')
    expect(uniqueQrFileName('A-1', '11', used)).toBe('certificate-A-1-11.png')
    expect(uniqueQrFileName('a-1', '12', used)).toBe('certificate-a-1-12.png')
  })
})

describe('buildExportZip', () => {
  it('writes a CSV of all rows and one QR PNG per certificate number', async () => {
    const docs: ExportDocument[] = [
      { $id: '1', CERTIFICATE_NO: 'TEST-1', PRODUCT_NAME: 'Ring, gold', CATEGORY: null, Certificate_photograph: 'x.jpg' },
      { $id: '2', CERTIFICATE_NO: '', PRODUCT_NAME: 'No number', CATEGORY: 'Gem' },
    ]

    const zip = await buildExportZip(docs, ['CERTIFICATE_NO', 'Certificate_photograph', 'PRODUCT_NAME', 'CATEGORY'])
    const files = unzipSync(zip)

    expect(Object.keys(files).sort()).toEqual(['certificates.csv', 'qr/certificate-TEST-1.png'])
    expect([...files['qr/certificate-TEST-1.png'].slice(0, 4)]).toEqual(PNG_SIGNATURE)

    const csv = parseCSV(strFromU8(files['certificates.csv']))
    expect(csv.errors).toEqual([])
    expect(csv.headers).toEqual(['CERTIFICATE_NO', 'PRODUCT_NAME', 'CATEGORY', 'QR_URL', 'QR_FILE'])
    expect(csv.rows).toEqual([
      ['TEST-1', 'Ring, gold', '', 'https://globallabtesting.in/?batch=TEST-1', 'qr/certificate-TEST-1.png'],
      ['', 'No number', 'Gem', '', ''],
    ])
  })
})
