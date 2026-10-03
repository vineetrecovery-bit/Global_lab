import { describe, expect, it } from 'vitest'
import { parseCSV } from '@/lib/csv'

describe('CSV parser', () => {
  it('parses a simple synthetic row', () => {
    const parsed = parseCSV('certificate,category\nTEST-1,gem\n')

    expect(parsed.headers).toEqual(['certificate', 'category'])
    expect(parsed.rows).toEqual([['TEST-1', 'gem']])
    expect(parsed.errors).toEqual([])
  })

  it('preserves a comma inside a quoted field', () => {
    expect(parseCSV('certificate,description,category\nTEST-1,"red, blue",gem\n').rows[0]).toEqual([
      'TEST-1',
      'red, blue',
      'gem',
    ])
  })

  it('preserves escaped quotes inside a quoted field', () => {
    expect(parseCSV('certificate,description\nTEST-1,"a ""quoted"" value"\n').rows[0]).toEqual([
      'TEST-1',
      'a "quoted" value',
    ])
  })

  it('supports multiline quoted fields, BOM and CRLF input', () => {
    const parsed = parseCSV('\ufeffcertificate,description\r\nTEST-1,"line 1\r\nline 2"\r\n')

    expect(parsed).toEqual({
      headers: ['certificate', 'description'],
      rows: [['TEST-1', 'line 1\r\nline 2']],
      errors: [],
    })
  })

  it('reports malformed row widths before import', () => {
    expect(parseCSV('certificate,description\nTEST-1,ok,extra\n').errors).toEqual([
      { row: 2, message: 'Expected 2 field(s), found 3' },
    ])
  })

  it('reports an unclosed quoted field', () => {
    expect(parseCSV('certificate,description\nTEST-1,"unfinished\n').errors).toContainEqual({
      row: 2,
      message: 'Quoted field is not closed',
    })
  })
})
