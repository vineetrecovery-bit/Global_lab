'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { QrCode, X } from 'lucide-react'
import QRCode from 'qrcode'
import { certificateVerificationUrl } from '@/lib/certificate-qr'

export function CertificateQrAction({ certificateNo }: { certificateNo: string | null | undefined }) {
  const [open, setOpen] = useState(false)
  const validNumber = typeof certificateNo === 'string' && certificateNo.trim().length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!validNumber}
        aria-label={validNumber ? `Generate QR for ${certificateNo}` : 'Generate QR unavailable: Certificate number is required'}
        title={validNumber ? `Generate QR for ${certificateNo}` : 'Certificate number is required'}
        className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-gold/10 hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
        Generate QR
      </button>
      {open && validNumber && (
        <CertificateQrDialog certificateNo={certificateNo} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

export function CertificateQrDialog({ certificateNo, onClose }: {
  certificateNo: string
  onClose: () => void
}) {
  const url = certificateVerificationUrl(certificateNo)
  const [qrResult, setQrResult] = useState<{ url: string; image: string } | null>(null)
  const [errorUrl, setErrorUrl] = useState('')
  const qrImage = qrResult?.url === url ? qrResult.image : ''
  const error = errorUrl === url

  useEffect(() => {
    let active = true
    QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      .then((image) => {
        if (active) setQrResult({ url, image })
      })
      .catch(() => {
        if (active) setErrorUrl(url)
      })
    return () => { active = false }
  }, [url])

  const downloadName = `certificate-${certificateNo.replace(/[^a-z0-9._-]+/gi, '-')}.png`

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="certificate-qr-title" className="relative w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close QR dialog" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <h3 id="certificate-qr-title" className="font-heading text-lg font-semibold">Certificate QR</h3>
        <p className="mt-1 text-sm text-muted-foreground">{certificateNo}</p>
        <div className="mt-5 flex min-h-72 items-center justify-center rounded-md bg-white p-4">
          {error ? (
            <p role="alert" className="text-center text-sm text-destructive">Could not generate the QR image. Please try again.</p>
          ) : qrImage ? (
            <Image unoptimized src={qrImage} alt={`QR code for certificate ${certificateNo}`} width={320} height={320} />
          ) : (
            <p role="status" className="text-sm text-neutral-600">Generating QR…</p>
          )}
        </div>
        <p className="mt-4 break-all text-xs text-muted-foreground">{url}</p>
        {qrImage && !error && (
          <a href={qrImage} download={downloadName} className="mt-5 block rounded-md bg-gold px-4 py-3 text-center text-sm font-medium text-gold-foreground hover:brightness-110">
            Download PNG
          </a>
        )}
      </div>
    </div>
  )
}
