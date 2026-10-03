import { describe, expect, it } from 'vitest'
import { csvRowToDocument, getCsvMapping } from '@/lib/csv-import'

describe('CSV import mapping', () => {
  it('maps headers case-insensitively and skips certificate images', () => {
    const headers = ['certificate_no', 'PRODUCT_NAME', 'Certificate_photograph', 'Unknown']
    const columns = ['CERTIFICATE_NO', 'PRODUCT_NAME', 'Certificate_photograph']
    const row = [' TEST-42 ', ' Synthetic ', 'ignored.jpg', 'extra']

    expect(csvRowToDocument(headers, row, columns)).toEqual({
      CERTIFICATE_NO: 'TEST-42',
      PRODUCT_NAME: 'Synthetic',
    })
  })

  it('reports matched and skipped headers', () => {
    expect(getCsvMapping(['CERTIFICATE_NO', 'Nope'], ['CERTIFICATE_NO'])).toEqual([
      { csv: 'CERTIFICATE_NO', db: 'CERTIFICATE_NO', matched: true },
      { csv: 'Nope', db: undefined, matched: false },
    ])
  })
})
