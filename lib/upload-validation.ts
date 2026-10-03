const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 8000
const MIN_IMAGE_DIMENSION = 1

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

export type ValidatedUpload = {
  contentType: string
  extension: '.jpg' | '.png' | '.webp' | '.gif'
  width: number
  height: number
}

export function validateUploadBytes(
  body: Buffer,
  declaredType: string,
  originalName: string
): ValidatedUpload {
  if (body.length === 0) {
    throw new UploadValidationError('Image file is empty')
  }
  if (body.length > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError('Image file is too large')
  }

  const detected = detectImage(body)
  if (!detected) {
    throw new UploadValidationError('Unsupported image file')
  }

  const normalizedDeclared = declaredType.toLowerCase()
  if (normalizedDeclared && normalizedDeclared !== detected.contentType) {
    throw new UploadValidationError('Image MIME type does not match file content')
  }

  const nameExt = originalName.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase()
  if (nameExt && !extensionsForType(detected.contentType).includes(nameExt)) {
    throw new UploadValidationError('Image extension does not match file content')
  }

  if (
    detected.width < MIN_IMAGE_DIMENSION ||
    detected.height < MIN_IMAGE_DIMENSION ||
    detected.width > MAX_IMAGE_DIMENSION ||
    detected.height > MAX_IMAGE_DIMENSION
  ) {
    throw new UploadValidationError('Image dimensions are out of range')
  }

  return detected
}

function detectImage(body: Buffer): ValidatedUpload | null {
  return detectJpeg(body) || detectPng(body) || detectGif(body) || detectWebp(body)
}

function detectJpeg(body: Buffer): ValidatedUpload | null {
  if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) return null

  let offset = 2
  while (offset + 9 < body.length) {
    if (body[offset] !== 0xff) {
      offset++
      continue
    }

    const marker = body[offset + 1]
    offset += 2

    if (marker === 0xd9 || marker === 0xda) break
    if (offset + 2 > body.length) break

    const segmentLength = body.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > body.length) break

    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf
    ) {
      return {
        contentType: 'image/jpeg',
        extension: '.jpg',
        width: body.readUInt16BE(offset + 5),
        height: body.readUInt16BE(offset + 3),
      }
    }

    offset += segmentLength
  }

  throw new UploadValidationError('Unsupported image file')
}

function detectPng(body: Buffer): ValidatedUpload | null {
  if (
    body.length < 24 ||
    body[0] !== 0x89 ||
    body[1] !== 0x50 ||
    body[2] !== 0x4e ||
    body[3] !== 0x47 ||
    body[4] !== 0x0d ||
    body[5] !== 0x0a ||
    body[6] !== 0x1a ||
    body[7] !== 0x0a
  ) {
    return null
  }

  return {
    contentType: 'image/png',
    extension: '.png',
    width: body.readUInt32BE(16),
    height: body.readUInt32BE(20),
  }
}

function detectGif(body: Buffer): ValidatedUpload | null {
  if (body.length < 10) return null
  const signature = body.subarray(0, 6).toString('ascii')
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return null

  return {
    contentType: 'image/gif',
    extension: '.gif',
    width: body.readUInt16LE(6),
    height: body.readUInt16LE(8),
  }
}

function detectWebp(body: Buffer): ValidatedUpload | null {
  if (
    body.length < 30 ||
    body.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    body.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return null
  }

  const chunk = body.subarray(12, 16).toString('ascii')
  if (chunk === 'VP8X' && body.length >= 30) {
    return {
      contentType: 'image/webp',
      extension: '.webp',
      width: 1 + body.readUIntLE(24, 3),
      height: 1 + body.readUIntLE(27, 3),
    }
  }

  if (chunk === 'VP8 ' && body.length >= 30) {
    return {
      contentType: 'image/webp',
      extension: '.webp',
      width: body.readUInt16LE(26) & 0x3fff,
      height: body.readUInt16LE(28) & 0x3fff,
    }
  }

  if (chunk === 'VP8L' && body.length >= 25) {
    const bits = body.readUInt32LE(21)
    return {
      contentType: 'image/webp',
      extension: '.webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    }
  }

  throw new UploadValidationError('Unsupported image file')
}

function extensionsForType(contentType: string) {
  if (contentType === 'image/jpeg') return ['.jpg', '.jpeg']
  if (contentType === 'image/png') return ['.png']
  if (contentType === 'image/webp') return ['.webp']
  if (contentType === 'image/gif') return ['.gif']
  return []
}
