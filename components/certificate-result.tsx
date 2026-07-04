'use client'

import Image from 'next/image'
import { BadgeCheck, ShieldX, Hash, Tag } from 'lucide-react'
import type { Certificate } from '@/lib/certificates'

function hasValue(val: string | null | undefined): val is string {
  return !!val && val.trim().length > 0
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function getFieldIcon(key: string) {
  if (key.toLowerCase().includes('type')) return Tag
  if (key.toLowerCase().includes('dimension')) return null
  if (key.toLowerCase().includes('origin')) return null
  if (key.toLowerCase().includes('weight')) return null
  if (key.toLowerCase().includes('date')) return null
  return null
}

export function CertificateResult({
  result,
}: {
  result: Certificate | 'not-found' | null
}) {
  if (!result) return null

  if (result === 'not-found') {
    return (
      <div className="animate-fade-up mt-8 overflow-hidden rounded-lg border border-destructive/30 bg-card/80 p-8 text-center backdrop-blur">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldX className="h-8 w-8 text-destructive" />
        </div>
        <h3 className="font-heading mt-5 text-2xl font-semibold text-foreground">
          Certificate Not Found
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          We could not locate a certificate matching that verification number.
          Please check the number and try again.
        </p>
      </div>
    )
  }

  // Build dynamic details list — Batchno always first, then all other non-empty fields
  const details: { label: string; value: string; icon: any }[] = []

  // Batchno always shows
  details.push({ label: 'Batch Number', value: result.Batchno, icon: Hash })

  // All other fields except Certificate_photograph
  Object.entries(result).forEach(([key, value]) => {
    if (key === 'Batchno' || key === 'Certificate_photograph') return
    if (hasValue(value)) {
      details.push({
        label: formatLabel(key),
        value: value,
        icon: getFieldIcon(key),
      })
    }
  })

  const showImage = hasValue(result.Certificate_photograph)

  return (
    <div className="animate-fade-up mt-8 overflow-hidden rounded-lg border border-gold/30 bg-card shadow-xl shadow-black/10">
      <div className="flex items-center gap-3 bg-primary px-6 py-4 sm:px-8">
        <BadgeCheck className="h-6 w-6 text-gold" />
        <div>
          <p className="text-[0.7rem] tracking-luxury text-gold">
            VERIFICATION STATUS
          </p>
          <p className="font-heading text-xl font-semibold text-primary-foreground">
            VERIFIED
          </p>
        </div>
        <span className="ml-auto rounded-full border border-gold/40 px-3 py-1 text-[0.65rem] tracking-luxury text-gold">
          RUDRAKSHA
        </span>
      </div>

      <div className={`grid gap-8 p-6 sm:p-8 ${showImage ? 'md:grid-cols-[1fr_1.3fr]' : ''}`}>
        {showImage && (
          <a
            href={result.Certificate_photograph}
            target="_blank"
            rel="noopener noreferrer"
            className="overflow-hidden rounded-md border border-border bg-secondary transition-all duration-300 hover:border-gold/50 hover:shadow-lg"
          >
            <Image
              src={result.Certificate_photograph!}
              alt={`Certificate ${result.Batchno}`}
              width={800}
              height={1100}
              className="h-auto w-full object-contain"
              sizes="(max-width: 768px) 100vw, 400px"
            />
          </a>
        )}

        <dl className={`flex flex-col justify-center divide-y divide-border ${!showImage ? 'col-span-full' : ''}`}>
          {details.length > 0 ? (
            details.map((d) => (
              <div
                key={d.label}
                className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                {d.icon ? (
                  <d.icon className="h-4 w-4 shrink-0 text-gold" />
                ) : (
                  <span className="h-4 w-4 shrink-0" />
                )}
                <dt className="w-40 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                  {d.label}
                </dt>
                <dd className="font-medium text-foreground">{d.value}</dd>
              </div>
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              Only batch number is available for this certificate.
            </p>
          )}
        </dl>
      </div>
    </div>
  )
}