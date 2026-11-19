// Server use-case: repair the QR on a stored certificate image.
// Originals are never overwritten; the fixed image is uploaded under a new immutable
// key and attached through the revision-checked certificate transaction.
import type { RowDataPacket } from 'mysql2'
import sharp from 'sharp'
import { AdminCertificateNotFoundError, updateAdminCertificate } from '@/lib/admin-certificates'
import { certificateVerificationUrl } from '@/lib/certificate-qr'
import { fixCertificateQr, QrFixError, type ManualRegion } from '@/lib/certificate-qr-fix'
import { getMysqlPool } from '@/lib/mysql'
import { fetchR2Object, putR2Object } from '@/lib/r2'
import { createUploadAttachmentToken } from '@/lib/upload-attachment'
import { objectKeyForUpload } from '@/lib/upload-key'
import { validateUploadBytes } from '@/lib/upload-validation'

export class QrFixSourceError extends Error {
  constructor(readonly code: 'no_certificate_number' | 'no_image' | 'storage_unavailable', message: string) {
    super(message)
    this.name = 'QrFixSourceError'
  }
}

type SourceRow = RowDataPacket & {
  CERTIFICATE_NO: string | null
  r2_object_key: string | null
  Certificate_photograph: string | null
}

export type QrFixOutcome =
  | { status: 'already_correct'; expectedUrl: string }
  | {
      status: 'preview' | 'applied'
      expectedUrl: string
      decodedBefore: string | null
      lossless: boolean
      region: { x: number; y: number; size: number }
      beforePreview: string
      afterPreview: string
      document?: unknown
    }

export async function fixCertificateImageQr(input: {
  id: number
  apply: boolean
  region?: ManualRegion
  expectedRevision?: string
}): Promise<QrFixOutcome> {
  const [rows] = await getMysqlPool().execute<SourceRow[]>(
    'SELECT `CERTIFICATE_NO`, `r2_object_key`, `Certificate_photograph` FROM `certificates` WHERE `id` = :id LIMIT 1',
    { id: input.id }
  )
  const row = rows[0]
  if (!row) throw new AdminCertificateNotFoundError()
  const certificateNo = row.CERTIFICATE_NO?.trim()
  if (!certificateNo) throw new QrFixSourceError('no_certificate_number', 'Certificate number is required')
  if (!row.r2_object_key) throw new QrFixSourceError('no_image', 'This certificate has no image')

  const original = await fetchR2Object({ objectKey: row.r2_object_key })
  if (!original.ok) {
    await original.body?.cancel().catch(() => undefined)
    throw new QrFixSourceError('storage_unavailable', 'Certificate image is temporarily unavailable')
  }

  const expectedUrl = certificateVerificationUrl(certificateNo)
  const result = await fixCertificateQr({
    image: Buffer.from(await original.arrayBuffer()),
    expectedUrl,
    region: input.region,
  })
  if (result.status === 'already_correct') return { status: 'already_correct', expectedUrl }

  const summary = {
    expectedUrl,
    decodedBefore: result.before,
    lossless: result.lossless,
    region: { x: result.region.x, y: result.region.y, size: result.region.size },
    beforePreview: toDataUrl(result.beforePreview),
    afterPreview: toDataUrl(result.afterPreview),
  }
  if (!input.apply) return { status: 'preview', ...summary }

  const validated = validateUploadBytes(result.image, result.contentType, `certificate${result.extension}`)
  const objectKey = objectKeyForUpload(
    { name: `certificate${result.extension}`, type: result.contentType },
    certificateNo,
    validated.extension
  )
  const put = await putR2Object({ objectKey, body: result.image, contentType: validated.contentType })
  if (!put.ok) {
    await put.body?.cancel().catch(() => undefined)
    throw new QrFixSourceError('storage_unavailable', 'Image upload is temporarily unavailable')
  }

  const document = await updateAdminCertificate(input.id, {
    __uploadedImage: {
      objectKey,
      attachmentToken: createUploadAttachmentToken(objectKey),
      originalName: row.Certificate_photograph || objectKey,
      thumbnailDataUrl: await thumbnailDataUrl(result.image),
    },
    ...(input.expectedRevision ? { __expectedRevision: input.expectedRevision } : {}),
  })
  return { status: 'applied', ...summary, document }
}

function toDataUrl(png: Buffer) {
  return `data:image/png;base64,${png.toString('base64')}`
}

async function thumbnailDataUrl(image: Buffer) {
  const { data, info } = await sharp(image)
    .rotate()
    .resize(120, 120, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer({ resolveWithObject: true })
  return `data:image/jpeg;width=${info.width};height=${info.height};base64,${data.toString('base64')}`
}

export { QrFixError }
