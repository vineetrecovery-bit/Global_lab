// Browser-only OCR for certificate images. Recognition runs locally in a web
// worker, so the certificate is never sent to a third party and no per-use cost
// is incurred. Imported lazily so the OCR engine is only downloaded when used.

const OCR_TIMEOUT_MS = 60_000
const MAX_UPSCALED_WIDTH = 4000

export class CertificateOcrError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CertificateOcrError'
  }
}

/**
 * @param scale Values above 1 re-read an enlarged copy. Small print such as a
 * certificate number beside a photo is often only recognised at 2x.
 */
export async function recognizeCertificateText(file: File, { scale = 1 }: { scale?: number } = {}): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new CertificateOcrError('Only image certificates can be read')
  }
  const image = scale > 1 ? await upscale(file, scale) : file

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CertificateOcrError('Reading the certificate timed out')), OCR_TIMEOUT_MS)
    })
    const { data } = await Promise.race([worker.recognize(image), timeout])
    return data.text
  } catch (error) {
    if (error instanceof CertificateOcrError) throw error
    throw new CertificateOcrError('Could not read text from this image')
  } finally {
    if (timer) clearTimeout(timer)
    await worker.terminate().catch(() => undefined)
  }
}

async function upscale(file: File, scale: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  try {
    const factor = Math.min(scale, MAX_UPSCALED_WIDTH / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * factor))
    canvas.height = Math.max(1, Math.round(bitmap.height * factor))
    const context = canvas.getContext('2d')
    if (!context) throw new CertificateOcrError('Could not prepare the image for reading')
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    bitmap.close()
  }
}
