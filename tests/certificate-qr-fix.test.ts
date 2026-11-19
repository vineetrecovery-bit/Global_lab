import QRCode from 'qrcode'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { certificateVerificationUrl } from '@/lib/certificate-qr'
import { fixCertificateQr, QrFixError } from '@/lib/certificate-qr-fix'

const EXPECTED = certificateVerificationUrl('GL-2026-0042')
const W = 640
const H = 480

type Fixture = { x: number; y: number; module: number; text: string; dark?: number[] }

function background() {
  const data = Buffer.alloc(W * H * 3, 250)
  // Deterministic "certificate" decoration: text-like bars.
  for (let row = 0; row < 12; row++) {
    for (let y = 40 + row * 14; y < 46 + row * 14; y++) {
      for (let x = 30; x < 30 + 200 + (row % 3) * 40; x++) data.fill(40, (y * W + x) * 3, (y * W + x) * 3 + 3)
    }
  }
  return data
}

function drawQr(data: Buffer, { x, y, module, text, dark = [10, 10, 10] }: Fixture) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue
      for (let dy = 0; dy < module; dy++) {
        for (let dx = 0; dx < module; dx++) {
          const p = ((y + r * module + dy) * W + x + c * module + dx) * 3
          data[p] = dark[0]; data[p + 1] = dark[1]; data[p + 2] = dark[2]
        }
      }
    }
  }
  return n * module
}

async function encode(data: Buffer, format: 'png' | 'jpeg') {
  const image = sharp(data, { raw: { width: W, height: H, channels: 3 } })
  return format === 'png' ? image.png().toBuffer() : image.jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer()
}

async function pixels(image: Buffer) {
  return (await sharp(image).raw().toBuffer({ resolveWithObject: true })).data
}

async function fixture(format: 'png' | 'jpeg', text = 'XJ9-garbage-%%%-not-a-url', extra?: Partial<Fixture>) {
  const data = background()
  const size = drawQr(data, { x: 400, y: 200, module: 6, text, ...extra })
  return { image: await encode(data, format), size }
}

describe('fixCertificateQr', () => {
  it('replaces a gibberish QR in a PNG and leaves every other pixel untouched', async () => {
    const { image, size } = await fixture('png')
    const result = await fixCertificateQr({ image, expectedUrl: EXPECTED })
    if (result.status !== 'fixed') throw new Error('expected a fix')

    expect(result.lossless).toBe(true)
    expect(result.contentType).toBe('image/png')
    expect(result.before).not.toBe(EXPECTED)

    const meta = await sharp(result.image).metadata()
    expect([meta.width, meta.height]).toEqual([W, H])

    const before = await pixels(image)
    const after = await pixels(result.image)
    const { x, y, size: regionSize } = result.region
    expect(regionSize).toBeGreaterThanOrEqual(size - 2)
    let changedOutside = 0
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const inside = px >= x - 1 && px < x + regionSize + 1 && py >= y - 1 && py < y + regionSize + 1
        if (inside) continue
        const p = (py * W + px) * 3
        if (before[p] !== after[p] || before[p + 1] !== after[p + 1] || before[p + 2] !== after[p + 2]) changedOutside++
      }
    }
    expect(changedOutside).toBe(0)
  })

  it('fixes a JPEG, keeping dimensions and flagging the encode as lossy', async () => {
    const { image } = await fixture('jpeg')
    const result = await fixCertificateQr({ image, expectedUrl: EXPECTED })
    if (result.status !== 'fixed') throw new Error('expected a fix')
    expect(result.contentType).toBe('image/jpeg')
    expect(result.lossless).toBe(false)
    const meta = await sharp(result.image).metadata()
    expect([meta.width, meta.height]).toEqual([W, H])
  })

  it('keeps the original QR colours', async () => {
    const { image } = await fixture('png', 'wrong', { dark: [20, 40, 120] })
    const result = await fixCertificateQr({ image, expectedUrl: EXPECTED })
    if (result.status !== 'fixed') throw new Error('expected a fix')
    const after = await pixels(result.image)
    const { x, y, size } = result.region
    let blue = 0
    for (let py = y; py < y + size; py++) {
      for (let px = x; px < x + size; px++) {
        const p = (py * W + px) * 3
        if (after[p] === 20 && after[p + 1] === 40 && after[p + 2] === 120) blue++
      }
    }
    expect(blue).toBeGreaterThan(100)
  })

  it('is deterministic: same input gives byte-identical output', async () => {
    const { image } = await fixture('png')
    const a = await fixCertificateQr({ image, expectedUrl: EXPECTED })
    const b = await fixCertificateQr({ image, expectedUrl: EXPECTED })
    if (a.status !== 'fixed' || b.status !== 'fixed') throw new Error('expected fixes')
    expect(a.image.equals(b.image)).toBe(true)
  })

  it('reports already_correct without re-encoding', async () => {
    const { image } = await fixture('png', EXPECTED)
    const result = await fixCertificateQr({ image, expectedUrl: EXPECTED })
    expect(result.status).toBe('already_correct')
  })

  it('fails with not_found when there is no QR', async () => {
    const image = await encode(background(), 'png')
    await expect(fixCertificateQr({ image, expectedUrl: EXPECTED })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('fails with multiple when two QR codes are present', async () => {
    const data = background()
    drawQr(data, { x: 330, y: 40, module: 4, text: 'one' })
    drawQr(data, { x: 400, y: 300, module: 4, text: 'two' })
    const image = await encode(data, 'png')
    await expect(fixCertificateQr({ image, expectedUrl: EXPECTED })).rejects.toMatchObject({ code: 'multiple' })
  })

  it('accepts a manual region when auto-detection is not wanted', async () => {
    const data = background()
    const size = drawQr(data, { x: 400, y: 200, module: 6, text: 'wrong' })
    const image = await encode(data, 'png')
    const result = await fixCertificateQr({ image, expectedUrl: EXPECTED, region: { x: 400, y: 200, size } })
    expect(result.status).toBe('fixed')
  })

  it('rejects regions outside the image and unsupported formats', async () => {
    const image = await encode(background(), 'png')
    await expect(
      fixCertificateQr({ image, expectedUrl: EXPECTED, region: { x: 600, y: 400, size: 200 } })
    ).rejects.toBeInstanceOf(QrFixError)
    await expect(fixCertificateQr({ image: Buffer.from('not an image'), expectedUrl: EXPECTED })).rejects.toMatchObject({
      code: 'unsupported_format',
    })
  })

  it('preserves the ICC profile and pixels outside the QR for tagged images', async () => {
    const data = background()
    drawQr(data, { x: 400, y: 200, module: 6, text: 'wrong' })
    const image = await sharp(data, { raw: { width: W, height: H, channels: 3 } }).withIccProfile('p3').png().toBuffer()
    const result = await fixCertificateQr({ image, expectedUrl: EXPECTED })
    if (result.status !== 'fixed') throw new Error('expected a fix')
    expect((await sharp(result.image).metadata()).hasProfile).toBe(true)
    const before = await pixels(image)
    const after = await pixels(result.image)
    expect(after.subarray(0, 200 * W * 3).equals(before.subarray(0, 200 * W * 3))).toBe(true)
  })
})
