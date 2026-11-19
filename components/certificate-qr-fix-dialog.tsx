'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ScanLine, X } from 'lucide-react'
import * as admin from '@/lib/admin'

type Region = admin.QrFixRegion
type FixDoc = { $id: string; CERTIFICATE_NO?: string | null; $revision?: string; $imageUrl?: string }

const MANUAL_CODES = new Set(['not_found', 'multiple', 'rotated', 'inconsistent', 'invalid_region'])

export function CertificateQrFixAction({ doc, onFixed }: { doc: FixDoc; onFixed: () => void }) {
  const [open, setOpen] = useState(false)
  const usable = Boolean(doc.CERTIFICATE_NO?.trim()) && Boolean(doc.$imageUrl)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!usable}
        aria-label={usable ? `Fix QR on certificate image ${doc.CERTIFICATE_NO}` : 'Fix QR unavailable: certificate number and image are required'}
        title={usable ? 'Replace the QR on the certificate image with the correct one' : 'Certificate number and image are required'}
        className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-gold/10 hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
        Fix QR
      </button>
      {open && usable && (
        <CertificateQrFixDialog
          doc={doc}
          onClose={() => setOpen(false)}
          onFixed={() => { setOpen(false); onFixed() }}
        />
      )}
    </>
  )
}

function CertificateQrFixDialog({ doc, onClose, onFixed }: { doc: FixDoc; onClose: () => void; onFixed: () => void }) {
  const [busy, setBusy] = useState<'preview' | 'apply' | null>('preview')
  const [result, setResult] = useState<admin.QrFixResponse | null>(null)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [region, setRegion] = useState<Region | undefined>()
  const [manual, setManual] = useState(false)

  const fail = useCallback((err: unknown) => {
    const failure = err instanceof admin.QrFixRequestError ? err : null
    setResult(null)
    setError({ message: err instanceof Error ? err.message : 'Request failed', code: failure?.code })
    if (failure?.code && MANUAL_CODES.has(failure.code)) setManual(true)
  }, [])

  const run = useCallback((mode: 'preview' | 'apply', useRegion?: Region) => {
    setBusy(mode)
    setError(null)
    admin
      .fixCertificateQr(doc.$id, {
        mode,
        region: useRegion,
        expectedRevision: mode === 'apply' ? doc.$revision : undefined,
      })
      .then((response) => {
        if (mode === 'apply') {
          onFixed()
          return
        }
        setResult(response)
        setManual(false)
      })
      .catch(fail)
      .finally(() => setBusy(null))
  }, [doc.$id, doc.$revision, fail, onFixed])

  // Initial auto-detect preview; state is only set from async callbacks.
  useEffect(() => {
    let active = true
    admin
      .fixCertificateQr(doc.$id, { mode: 'preview' })
      .then((response) => { if (active) setResult(response) })
      .catch((err) => { if (active) fail(err) })
      .finally(() => { if (active) setBusy(null) })
    return () => { active = false }
  }, [doc.$id, fail])

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy === 'apply' ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="qr-fix-title" className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl">
        <button type="button" onClick={onClose} disabled={busy === 'apply'} aria-label="Close Fix QR dialog" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <h3 id="qr-fix-title" className="font-heading text-lg font-semibold">Fix certificate QR</h3>
        <p className="mt-1 text-sm text-muted-foreground">{doc.CERTIFICATE_NO}</p>

        {busy === 'preview' && (
          <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding and checking the QR…
          </p>
        )}

        {error && (
          <p role="alert" className="mt-5 text-sm text-destructive">{error.message}</p>
        )}

        {manual && !busy && (
          <RegionPicker
            certificateNo={doc.CERTIFICATE_NO ?? ''}
            onPick={(picked) => { setRegion(picked); run('preview', picked) }}
          />
        )}

        {result?.status === 'already_correct' && (
          <p role="status" className="mt-5 text-sm text-foreground">This QR already points to the correct URL. Nothing to fix.</p>
        )}

        {result && result.status !== 'already_correct' && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <figure>
                <figcaption className="mb-1 text-xs text-muted-foreground">Current</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.beforePreview} alt="Current QR on the certificate" className="w-full rounded bg-white" style={{ imageRendering: 'pixelated' }} />
              </figure>
              <figure>
                <figcaption className="mb-1 text-xs text-muted-foreground">Fixed</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.afterPreview} alt="Repaired QR" className="w-full rounded bg-white" style={{ imageRendering: 'pixelated' }} />
              </figure>
            </div>
            <p className="break-all text-xs text-muted-foreground">
              Currently reads: {result.decodedBefore ?? 'nothing scannable'}
              <br />
              Will encode: {result.expectedUrl}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.lossless
                ? 'Only the QR area changes; every other pixel stays identical.'
                : 'Only the QR area is repainted, but JPEG must be re-encoded (quality 98, no chroma subsampling), so there is a very slight overall change.'}
              {' '}The original file is kept in storage.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => run('apply', region)}
                disabled={busy !== null}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-sm font-medium text-gold-foreground hover:brightness-110 disabled:opacity-60"
              >
                {busy === 'apply' && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy === 'apply' ? 'Applying…' : 'Apply fix'}
              </button>
              <button type="button" onClick={() => setManual((v) => !v)} disabled={busy !== null} className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
                Select region
              </button>
            </div>
            {manual && (
              <RegionPicker certificateNo={doc.CERTIFICATE_NO ?? ''} onPick={(picked) => { setRegion(picked); run('preview', picked) }} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RegionPicker({ certificateNo, onPick }: { certificateNo: string; onPick: (region: Region) => void }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [box, setBox] = useState<{ x: number; y: number; size: number } | null>(null)

  const point = (event: React.PointerEvent) => {
    const rect = imgRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const confirm = () => {
    const img = imgRef.current
    if (!img || !box || !img.clientWidth) return
    const scale = img.naturalWidth / img.clientWidth
    onPick({ x: Math.round(box.x * scale), y: Math.round(box.y * scale), size: Math.round(box.size * scale) })
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-muted-foreground">Drag a square around the QR code (modules only, a small margin is fine).</p>
      <div className="relative inline-block max-w-full touch-none select-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={`/api/certificates/${encodeURIComponent(certificateNo)}/image`}
          alt="Certificate"
          draggable={false}
          className="block max-h-[50vh] max-w-full"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            start.current = point(event)
            setBox(null)
          }}
          onPointerMove={(event) => {
            if (!start.current) return
            const p = point(event)
            const size = Math.max(Math.abs(p.x - start.current.x), Math.abs(p.y - start.current.y))
            setBox({
              x: p.x < start.current.x ? start.current.x - size : start.current.x,
              y: p.y < start.current.y ? start.current.y - size : start.current.y,
              size,
            })
          }}
          onPointerUp={() => { start.current = null }}
        />
        {box && box.size > 0 && (
          <div className="pointer-events-none absolute border-2 border-gold" style={{ left: box.x, top: box.y, width: box.size, height: box.size }} />
        )}
      </div>
      <button type="button" onClick={confirm} disabled={!box || box.size < 10} className="mt-3 rounded-md border border-border px-4 py-2 text-xs text-foreground hover:border-gold/50 disabled:opacity-50">
        Preview with this region
      </button>
    </div>
  )
}
