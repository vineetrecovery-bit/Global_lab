import QRCode from 'qrcode'
import { strToU8, zipSync, type Zippable } from 'fflate'
import {
  CERTIFICATE_QR_OPTIONS,
  certificateQrFileName,
  certificateVerificationUrl,
} from '@/lib/certificate-qr'
import { serializeCSV } from '@/lib/csv'

export type ExportDocument = Record<string, unknown> & { $id: string }

export type ExportPage = { documents: ExportDocument[]; total: number }

export type ExportProgress = {
  phase: 'fetching' | 'qr' | 'zipping'
  done: number
  total: number
}

type ExportOptions = {
  signal?: AbortSignal
  onProgress?: (progress: ExportProgress) => void
}

const EXCLUDED_COLUMNS = new Set(['Certificate_photograph'])
const EXPORT_PAGE_SIZE = 100

export async function fetchAllDocuments(
  fetchPage: (page: number, pageSize: number) => Promise<ExportPage>,
  { signal, onProgress }: ExportOptions = {}
) {
  const byId = new Map<string, ExportDocument>()
  let firstTotal: number | null = null
  let lastTotal = 0

  for (let page = 1; ; page++) {
    throwIfAborted(signal)
    const result = await fetchPage(page, EXPORT_PAGE_SIZE)
    firstTotal ??= result.total
    lastTotal = result.total
    for (const document of result.documents) byId.set(document.$id, document)
    onProgress?.({ phase: 'fetching', done: byId.size, total: lastTotal })
    if (result.documents.length < EXPORT_PAGE_SIZE) break
  }

  const documents = [...byId.values()]
  return {
    documents,
    changedDuringExport: firstTotal !== lastTotal || documents.length !== lastTotal,
  }
}

export async function buildExportZip(
  documents: ExportDocument[],
  columnKeys: string[],
  { signal, onProgress }: ExportOptions = {}
): Promise<Uint8Array> {
  const columns = columnKeys.filter((key) => !EXCLUDED_COLUMNS.has(key))
  const usedNames = new Set<string>()
  const files: Zippable = {}
  const rows: string[][] = []

  for (let index = 0; index < documents.length; index++) {
    throwIfAborted(signal)
    const document = documents[index]
    const certificateNo = String(document.CERTIFICATE_NO ?? '').trim()
    let qrUrl = ''
    let qrFile = ''

    if (certificateNo) {
      qrUrl = certificateVerificationUrl(certificateNo)
      qrFile = `qr/${uniqueQrFileName(certificateNo, document.$id, usedNames)}`
      files[qrFile] = [await renderQrPng(qrUrl), { level: 0 }]
    }

    rows.push([...columns.map((key) => cellValue(document[key])), qrUrl, qrFile])
    onProgress?.({ phase: 'qr', done: index + 1, total: documents.length })
  }

  throwIfAborted(signal)
  onProgress?.({ phase: 'zipping', done: 0, total: 1 })
  files['certificates.csv'] = strToU8(serializeCSV([...columns, 'QR_URL', 'QR_FILE'], rows))
  return zipSync(files)
}

export function exportFileName(date = new Date()) {
  return `global-lab-export-${date.toISOString().slice(0, 10)}.zip`
}

export function uniqueQrFileName(certificateNo: string, id: string, usedNames: Set<string>) {
  let name = certificateQrFileName(certificateNo)
  // Distinct certificate numbers can sanitize to the same name; filesystems may also ignore case.
  if (usedNames.has(name.toLowerCase())) {
    name = name.replace(/\.png$/, `-${id}.png`)
  }
  usedNames.add(name.toLowerCase())
  return name
}

async function renderQrPng(url: string) {
  const dataUrl = await QRCode.toDataURL(url, CERTIFICATE_QR_OPTIONS)
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function cellValue(value: unknown) {
  return value === null || value === undefined ? '' : String(value)
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
}
