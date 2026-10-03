export type CsvMapping = {
  csv: string
  db?: string
  matched: boolean
}

export function getCsvMapping(headers: string[], columnKeys: string[]): CsvMapping[] {
  return headers.map((header) => {
    const matched = findColumnKey(header, columnKeys)
    return { csv: header, db: matched, matched: !!matched }
  })
}

export function csvRowToDocument(
  headers: string[],
  row: string[],
  columnKeys: string[]
): Record<string, unknown> {
  const doc: Record<string, unknown> = {}

  headers.forEach((header, index) => {
    const matchedKey = findColumnKey(header, columnKeys)
    if (matchedKey && matchedKey !== 'Certificate_photograph') {
      doc[matchedKey] = row[index]?.trim() || ''
    }
  })

  return doc
}

function findColumnKey(header: string, columnKeys: string[]) {
  const normalized = header.toLowerCase().trim()
  return columnKeys.find((key) => key.toLowerCase() === normalized)
}
