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
          Match Not Found
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          We could not locate a entry matching that verification number.
          Please check the number and try again.
        </p>
      </div>
    )
  }

  // Build dynamic details list
  const details: { label: string; value: string }[] = []

  details.push({ label: 'Batch Number', value: result.Batchno })

  Object.entries(result).forEach(([key, value]) => {
    if (key === 'Batchno' || key === 'Certificate_photograph') return
    if (hasValue(value)) {
      details.push({
        label: formatLabel(key),
        value: value,
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
        <span className="ml-auto rounded-full border border-gold/40 px-3 py-1 text-[0.65rem] tracking-luxury text-gold font-semibold">
          {hasValue(result.CATEGORY) ? result.CATEGORY.toUpperCase() : 'RUDRAKSHA'}
        </span>
      </div>

      <div className="p-6 sm:p-8">
        {/* Image on top, centered, compact */}
        {showImage && (
          <div className="mb-6 flex justify-center">
            <a
              // href={`/?batch=${encodeURIComponent(result.Batchno)}`}
              href={result.Certificate_photograph}
              target="_blank"
              rel="noopener noreferrer"
              className="overflow-hidden rounded-md border border-border bg-secondary transition-all duration-300 hover:border-gold/50 hover:shadow-lg"
            >
              <Image
                src={result.Certificate_photograph!}
                alt={`Certificate ${result.Batchno}`}
                width={320}
                height={440}
                className="h-auto w-full max-w-xs object-contain"
                sizes="320px"
              />
            </a>
          </div>
        )}

        {/* Details below */}
        <dl className="grid gap-x-8 gap-y-0 divide-y divide-border sm:grid-cols-2">
          {details.length > 0 ? (
            details.map((d) => (
              <div
                key={d.label}
                className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <Hash className="h-3.5 w-3.5 shrink-0 text-gold" />
                <dt className="w-36 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
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