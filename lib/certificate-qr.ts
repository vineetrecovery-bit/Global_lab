import type { QRCodeToDataURLOptions } from 'qrcode'

export const CERTIFICATE_QR_OPTIONS: QRCodeToDataURLOptions = {
  width: 320,
  margin: 2,
  errorCorrectionLevel: 'M',
}

export function certificateVerificationUrl(certificateNo: string): string {
  const url = new URL('https://globallabtesting.in/')
  url.searchParams.set('batch', certificateNo)
  return url.toString()
}

export function certificateQrFileName(certificateNo: string): string {
  return `certificate-${certificateNo.replace(/[^a-z0-9._-]+/gi, '-')}.png`
}
