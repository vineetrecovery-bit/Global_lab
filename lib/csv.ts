export type ParsedCSV = {
  headers: string[]
  rows: string[][]
  errors: CSVError[]
}

export type CSVError = {
  row: number
  message: string
}

export function parseCSV(text: string): ParsedCSV {
  const rows: string[][] = []
  const errors: CSVError[] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let rowNumber = 1
  let fieldQuoted = false
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      if (field.length === 0) {
        inQuotes = true
        fieldQuoted = true
      } else {
        errors.push({ row: rowNumber, message: 'Unexpected quote in unquoted field' })
        field += char
      }
      continue
    }

    if (char === ',') {
      row.push(normalizeField(field, fieldQuoted))
      field = ''
      fieldQuoted = false
      continue
    }

    if (char === '\n' || char === '\r') {
      row.push(normalizeField(field, fieldQuoted))
      rows.push(row)
      row = []
      field = ''
      fieldQuoted = false
      rowNumber++
      if (char === '\r' && input[i + 1] === '\n') {
        i++
      }
      continue
    }

    field += char
  }

  if (inQuotes) {
    errors.push({ row: rowNumber, message: 'Quoted field is not closed' })
  }

  if (field.length > 0 || fieldQuoted || row.length > 0) {
    row.push(normalizeField(field, fieldQuoted))
    rows.push(row)
  }

  const allRows = rows.filter((candidate) => candidate.some((cell) => cell.length > 0))

  if (allRows.length === 0) return { headers: [], rows: [], errors }

  const headers = allRows[0].map((header) => header.trim())
  const dataRows = allRows.slice(1)
  const expectedWidth = headers.length

  dataRows.forEach((candidate, index) => {
    if (candidate.length !== expectedWidth) {
      errors.push({
        row: index + 2,
        message: `Expected ${expectedWidth} field(s), found ${candidate.length}`,
      })
    }
  })

  return {
    headers,
    rows: dataRows,
    errors,
  }
}

function normalizeField(value: string, quoted: boolean) {
  return quoted ? value : value.trim()
}
