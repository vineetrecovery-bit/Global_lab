// Browser-side bulk actions for rows selected in the admin table.
// Both helpers are sequential, never throw for a single row, and only act on
// rows that can be acted on; every other selected row is counted as skipped.
import { zipSync, type Zippable } from 'fflate'

export type BulkDocument = {
  $id: string
  CERTIFICATE_NO?: unknown
  $revision?: string
  $imageUrl?: string
}

export type BulkProgress = { done: number; total: number }

type BulkOptions = {
  signal?: AbortSignal
  onProgress?: (progress: BulkProgress) => void
}

// ---- Bulk Fix QR ----

export type BulkQrFixRequest = (
  docId: string,
  options: { mode: 'apply'; expectedRevision?: string }
) => Promise<{ status: string }>

export type BulkQrFixSummary = {
  fixed: string[]
  alreadyCorrect: string[]
  skipped: string[]
  failed: { certificateNo: string; message: string }[]
}

function certificateNoOf(doc: BulkDocument) {
  return String(doc.CERTIFICATE_NO ?? '').trim()
}

export function canFixQr(doc: BulkDocument) {
  return Boolean(certificateNoOf(doc)) && Boolean(doc.$imageUrl)
}

// Applies the deterministic, server-verified QR fix to every selected row that has a
// certificate number and image. Rows whose QR already decodes to the correct URL are
// left untouched by the server; rows without a number or image are skipped.
export async function bulkFixCertificateQrs(
  documents: BulkDocument[],
  fix: BulkQrFixRequest,
  { signal, onProgress }: BulkOptions = {}
): Promise<BulkQrFixSummary> {
  const summary: BulkQrFixSummary = { fixed: [], alreadyCorrect: [], skipped: [], failed: [] }
  const eligible = documents.filter((doc) => {
    if (canFixQr(doc)) return true
    summary.skipped.push(certificateNoOf(doc) || `row ${doc.$id}`)
    return false
  })

  onProgress?.({ done: 0, total: eligible.length })
  for (let index = 0; index < eligible.length; index++) {
    throwIfAborted(signal)
    const doc = eligible[index]
    const certificateNo = certificateNoOf(doc)
    try {
      const result = await fix(doc.$id, { mode: 'apply', expectedRevision: doc.$revision })
      if (result.status === 'already_correct') summary.alreadyCorrect.push(certificateNo)
      else summary.fixed.push(certificateNo)
    } catch (error) {
      summary.failed.push({ certificateNo, message: error instanceof Error ? error.message : 'Fix failed' })
    }
    onProgress?.({ done: index + 1, total: eligible.length })
  }
  return summary
}

// ---- Download certificates as zip ----

export class NoCertificateImagesError extends Error {
  constructor(message = 'No photo selected. None of the selected rows has a certificate image.') {
    super(message)
    this.name = 'NoCertificateImagesError'
  }
}

export type CertificateImageFetch = (url: string, signal?: AbortSignal) => Promise<Response>

export type CertificateZipResult = {
  zip: Uint8Array
  added: number
  skipped: string[]
  failed: { certificateNo: string; message: string }[]
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
}

export function certificateImageFileName(
  certificateNo: string,
  contentType: string | null,
  id: string,
  usedNames: Set<string>
) {
  const mime = (contentType ?? '').split(';')[0].trim().toLowerCase()
  const extension = EXTENSIONS[mime] ?? '.jpg'
  const base = `certificate-${certificateNo.replace(/[^a-z0-9._-]+/gi, '-')}`
  // Distinct certificate numbers can sanitize to the same name; filesystems may also ignore case.
  let name = `${base}${extension}`
  if (usedNames.has(name.toLowerCase())) name = `${base}-${id}${extension}`
  usedNames.add(name.toLowerCase())
  return name
}

// Builds a zip of the original images of the selected rows. Rows without an image are
// silently ignored. Throws NoCertificateImagesError when nothing could be added.
export async function buildCertificateImagesZip(
  documents: BulkDocument[],
  fetchImage: CertificateImageFetch,
  { signal, onProgress }: BulkOptions = {}
): Promise<CertificateZipResult> {
  const skipped: string[] = []
  const eligible = documents.filter((doc) => {
    if (doc.$imageUrl && certificateNoOf(doc)) return true
    skipped.push(certificateNoOf(doc) || `row ${doc.$id}`)
    return false
  })
  if (eligible.length === 0) throw new NoCertificateImagesError()

  const files: Zippable = {}
  const usedNames = new Set<string>()
  const failed: CertificateZipResult['failed'] = []
  let added = 0

  onProgress?.({ done: 0, total: eligible.length })
  for (let index = 0; index < eligible.length; index++) {
    throwIfAborted(signal)
    const doc = eligible[index]
    const certificateNo = certificateNoOf(doc)
    try {
      const response = await fetchImage(doc.$imageUrl as string, signal)
      if (!response.ok) throw new Error(response.status === 404 ? 'Image not found' : `Download failed (${response.status})`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length === 0) throw new Error('Image is empty')
      const name = certificateImageFileName(certificateNo, response.headers.get('content-type'), doc.$id, usedNames)
      // Images are already compressed; store them without recompression.
      files[name] = [bytes, { level: 0 }]
      added++
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      failed.push({ certificateNo, message: error instanceof Error ? error.message : 'Download failed' })
    }
    onProgress?.({ done: index + 1, total: eligible.length })
  }

  if (added === 0) {
    throw new NoCertificateImagesError('No certificate images could be downloaded for the selected rows.')
  }
  throwIfAborted(signal)
  return { zip: zipSync(files), added, skipped, failed }
}

export function certificatesZipFileName(date = new Date()) {
  return `global-lab-certificates-${date.toISOString().slice(0, 10)}.zip`
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}
