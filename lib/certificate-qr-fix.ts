// Deterministic certificate QR repair. Locates the QR with finder-pattern geometry,
// repaints only that square with a pixel-exact QR for the expected URL, re-encodes
// once, and refuses to return anything that does not decode to the expected URL.
// No AI/ML, no randomness: identical input bytes always give identical output bytes.
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import sharp, { type Metadata } from 'sharp'
import { locateQr, otsuThreshold, QrLocateError, type QrRegion } from '@/lib/qr-locate'

export type QrFixErrorCode =
  | 'unsupported_format'
  | 'not_found'
  | 'multiple'
  | 'rotated'
  | 'inconsistent'
  | 'invalid_region'
  | 'region_too_small'
  | 'verify_failed'

export class QrFixError extends Error {
  constructor(readonly code: QrFixErrorCode, message: string) {
    super(message)
    this.name = 'QrFixError'
  }
}

export type ManualRegion = { x: number; y: number; size: number }

type Raw = { data: Buffer; width: number; height: number; channels: number }

export type QrFixResult =
  | { status: 'already_correct'; region: QrRegion; decoded: string }
  | {
      status: 'fixed'
      region: QrRegion
      image: Buffer
      contentType: 'image/png' | 'image/jpeg' | 'image/webp'
      extension: '.png' | '.jpg' | '.webp'
      lossless: boolean
      before: string | null
      beforePreview: Buffer
      afterPreview: Buffer
    }

const MIN_MODULE_PIXELS = 2

export async function fixCertificateQr(input: {
  image: Buffer
  expectedUrl: string
  region?: ManualRegion
}): Promise<QrFixResult> {
  const format = await detectFormat(input.image)
  const source = await decodeRaw(input.image)

  let region: QrRegion
  if (input.region) {
    region = validateManualRegion(input.region, source)
  } else {
    try {
      region = locateQr(grayOf(source))
    } catch (error) {
      if (error instanceof QrLocateError) throw new QrFixError(error.code, error.message)
      throw error
    }
  }

  const before = decodeQr(source, region)
  if (before === input.expectedUrl) {
    return { status: 'already_correct', region, decoded: before }
  }

  const patched = Buffer.from(source.data)
  const cover = paintQr({ ...source, data: patched }, region, input.expectedUrl)

  // Composite only the repainted rectangle onto the original so the ICC profile and
  // every untouched pixel stay as they were; re-encode exactly once.
  const encoded = await encode(input.image, { ...source, data: patched }, cover, format)
  const output = await decodeRaw(encoded.image)
  const after = decodeQr(output, region)
  if (after !== input.expectedUrl) {
    throw new QrFixError('verify_failed', 'The repaired QR did not decode to the expected URL; nothing was changed')
  }

  return {
    status: 'fixed',
    region,
    image: encoded.image,
    contentType: encoded.contentType,
    extension: encoded.extension,
    lossless: encoded.lossless,
    before,
    beforePreview: await previewOf(source, region),
    afterPreview: await previewOf(output, region),
  }
}

async function detectFormat(image: Buffer): Promise<'jpeg' | 'png' | 'webp'> {
  let metadata: Metadata
  try {
    metadata = await sharp(image).metadata()
  } catch {
    throw new QrFixError('unsupported_format', 'Unsupported image file')
  }
  if ((metadata.pages ?? 1) > 1) throw new QrFixError('unsupported_format', 'Animated images are not supported')
  if (metadata.format === 'jpeg' || metadata.format === 'png' || metadata.format === 'webp') return metadata.format
  throw new QrFixError('unsupported_format', 'Only JPEG, PNG and WebP certificates can be fixed')
}

async function decodeRaw(image: Buffer): Promise<Raw> {
  const { data, info } = await sharp(image).rotate().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

function grayOf(raw: Raw) {
  const { data, width, height, channels } = raw
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < gray.length; i++) {
    const p = i * channels
    gray[i] = channels <= 2 ? data[p] : (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114 + 500) / 1000 | 0
  }
  return { data: gray, width, height }
}

function validateManualRegion(region: ManualRegion, raw: Raw): QrRegion {
  const { x, y, size } = region
  if (![x, y, size].every((value) => Number.isInteger(value))) {
    throw new QrFixError('invalid_region', 'Region must use whole pixel values')
  }
  if (size < 21 || x < 0 || y < 0 || x + size > raw.width || y + size > raw.height) {
    throw new QrFixError('invalid_region', 'Region is outside the image')
  }
  return { x, y, size, moduleSize: size / 29 }
}

function cropRgba(raw: Raw, x0: number, y0: number, w: number, h: number) {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = ((y0 + y) * raw.width + (x0 + x)) * raw.channels
      const o = (y * w + x) * 4
      if (raw.channels <= 2) {
        out[o] = out[o + 1] = out[o + 2] = raw.data[p]
      } else {
        out[o] = raw.data[p]
        out[o + 1] = raw.data[p + 1]
        out[o + 2] = raw.data[p + 2]
      }
      out[o + 3] = 255
    }
  }
  return out
}

function paddedBounds(raw: Raw, region: QrRegion, pad: number) {
  const x0 = Math.max(0, region.x - pad)
  const y0 = Math.max(0, region.y - pad)
  const x1 = Math.min(raw.width, region.x + region.size + pad)
  const y1 = Math.min(raw.height, region.y + region.size + pad)
  return { x0, y0, w: x1 - x0, h: y1 - y0 }
}

function decodeQr(raw: Raw, region: QrRegion): string | null {
  const pad = Math.max(12, Math.round(region.size * 0.2))
  const { x0, y0, w, h } = paddedBounds(raw, region, pad)
  const result = jsQR(cropRgba(raw, x0, y0, w, h), w, h, { inversionAttempts: 'dontInvert' })
  return result ? result.data : null
}

function median(histogram: number[], total: number): number {
  let seen = 0
  for (let i = 0; i < 256; i++) {
    seen += histogram[i]
    if (seen * 2 >= total) return i
  }
  return 0
}

function sampleColors(raw: Raw, region: QrRegion) {
  const gray = grayOf(raw)
  const regionPixels: number[] = []
  for (let y = region.y; y < region.y + region.size; y++) {
    for (let x = region.x; x < region.x + region.size; x++) regionPixels.push(gray.data[y * raw.width + x])
  }
  const threshold = otsuThreshold(Uint8Array.from(regionPixels))
  const channelCount = Math.min(raw.channels, 3)
  const dark = Array.from({ length: channelCount }, () => new Array<number>(256).fill(0))
  const light = Array.from({ length: channelCount }, () => new Array<number>(256).fill(0))
  let darkTotal = 0
  let lightTotal = 0

  const band = Math.max(4, Math.round(region.moduleSize * 2))
  const bounds = paddedBounds(raw, region, band)
  for (let y = bounds.y0; y < bounds.y0 + bounds.h; y++) {
    for (let x = bounds.x0; x < bounds.x0 + bounds.w; x++) {
      const inside = x >= region.x && x < region.x + region.size && y >= region.y && y < region.y + region.size
      const g = gray.data[y * raw.width + x]
      const target = g <= threshold ? 'dark' : 'light'
      // Dark samples come from inside the QR; light samples from the surrounding band.
      if (target === 'dark' && !inside) continue
      if (target === 'light' && inside) continue
      const histogram = target === 'dark' ? dark : light
      for (let c = 0; c < channelCount; c++) histogram[c][raw.data[(y * raw.width + x) * raw.channels + c]]++
      if (target === 'dark') darkTotal++
      else lightTotal++
    }
  }
  const pick = (histogram: number[][], total: number, fallback: number) =>
    histogram.map((h) => (total > 0 ? median(h, total) : fallback))
  return { dark: pick(dark, darkTotal, 0), light: pick(light, lightTotal, 255) }
}

type Rect = { left: number; top: number; width: number; height: number }

function paintQr(raw: Raw, region: QrRegion, url: string): Rect {
  const colors = sampleColors(raw, region)
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size

  // Cover the old QR completely (1px slack for edge anti-aliasing).
  const cx0 = Math.max(0, region.x - 1)
  const cy0 = Math.max(0, region.y - 1)
  const cx1 = Math.min(raw.width, region.x + region.size + 1)
  const cy1 = Math.min(raw.height, region.y + region.size + 1)
  const cover = Math.min(cx1 - cx0, cy1 - cy0)
  const k = Math.floor(cover / n)
  if (k < MIN_MODULE_PIXELS) {
    throw new QrFixError('region_too_small', 'The QR area is too small to hold a scannable code')
  }
  const ox = cx0 + Math.floor((cx1 - cx0 - n * k) / 2)
  const oy = cy0 + Math.floor((cy1 - cy0 - n * k) / 2)

  const write = (x: number, y: number, color: number[]) => {
    const p = (y * raw.width + x) * raw.channels
    if (raw.channels <= 2) {
      raw.data[p] = (color[0] * 299 + color[1] * 587 + color[2] * 114 + 500) / 1000 | 0
      if (raw.channels === 2) raw.data[p + 1] = 255
    } else {
      raw.data[p] = color[0]
      raw.data[p + 1] = color[1]
      raw.data[p + 2] = color[2]
      if (raw.channels === 4) raw.data[p + 3] = 255
    }
  }
  const rgb = (color: number[]) => (color.length >= 3 ? color : [color[0], color[0], color[0]])
  const dark = rgb(colors.dark)
  const light = rgb(colors.light)

  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) write(x, y, light)
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!qr.modules.get(row, col)) continue
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) write(ox + col * k + dx, oy + row * k + dy, dark)
    }
  }
  return { left: cx0, top: cy0, width: cx1 - cx0, height: cy1 - cy0 }
}

async function encode(original: Buffer, painted: Raw, rect: Rect, format: 'jpeg' | 'png' | 'webp') {
  // Match the base image's channel layout so compositing never adds an alpha channel.
  const hasAlpha = (await sharp(original).metadata()).hasAlpha === true
  const outChannels = hasAlpha ? 4 : 3
  const patch = Buffer.alloc(rect.width * rect.height * outChannels)
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const p = ((rect.top + y) * painted.width + rect.left + x) * painted.channels
      const o = (y * rect.width + x) * outChannels
      if (painted.channels <= 2) {
        patch[o] = patch[o + 1] = patch[o + 2] = painted.data[p]
      } else {
        patch[o] = painted.data[p]
        patch[o + 1] = painted.data[p + 1]
        patch[o + 2] = painted.data[p + 2]
      }
      if (hasAlpha) patch[o + 3] = 255
    }
  }
  const pipeline = sharp(original)
    .rotate()
    .composite([
      {
        input: patch,
        raw: { width: rect.width, height: rect.height, channels: outChannels },
        left: rect.left,
        top: rect.top,
        blend: 'over',
      },
    ])
  // composite() always adds an alpha channel; drop it again when the source had none.
  const base = (hasAlpha ? pipeline : pipeline.removeAlpha()).keepIccProfile()
  if (format === 'png') {
    return {
      image: await base.png({ compressionLevel: 9 }).toBuffer(),
      contentType: 'image/png' as const,
      extension: '.png' as const,
      lossless: true,
    }
  }
  if (format === 'webp') {
    return {
      image: await base.webp({ lossless: true }).toBuffer(),
      contentType: 'image/webp' as const,
      extension: '.webp' as const,
      lossless: true,
    }
  }
  return {
    image: await base.jpeg({ quality: 98, chromaSubsampling: '4:4:4', mozjpeg: false }).toBuffer(),
    contentType: 'image/jpeg' as const,
    extension: '.jpg' as const,
    lossless: false,
  }
}

async function previewOf(raw: Raw, region: QrRegion): Promise<Buffer> {
  const pad = Math.round(region.moduleSize * 2)
  const { x0, y0, w, h } = paddedBounds(raw, region, pad)
  const rgba = cropRgba(raw, x0, y0, w, h)
  return sharp(Buffer.from(rgba.buffer), { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}
