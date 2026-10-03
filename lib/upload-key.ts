import { randomUUID } from 'node:crypto'

type UploadFileDescriptor = {
  name: string
  type: string
}

export function objectKeyForUpload(
  file: UploadFileDescriptor,
  certificateNo: string,
  validatedExtension?: string
) {
  const readablePrefix = sanitizeCertificateNo(certificateNo) || 'unassigned'
  return `certificates/${readablePrefix}-${randomUUID()}${validatedExtension || extensionForFile(file)}`
}

function sanitizeCertificateNo(certificateNo: string) {
  return certificateNo.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')
}

function extensionForFile(file: UploadFileDescriptor) {
  const nameExt = file.name.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase()
  if (nameExt && ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'].includes(nameExt)) {
    return nameExt === '.jpeg' ? '.jpg' : nameExt
  }
  if (file.type === 'image/png') return '.png'
  if (file.type === 'image/webp') return '.webp'
  if (file.type === 'image/gif') return '.gif'
  if (file.type === 'application/pdf') return '.pdf'
  return '.jpg'
}
