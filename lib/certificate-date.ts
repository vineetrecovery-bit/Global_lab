// Pure certificate-date formatting shared by the OCR extractor (browser) and
// the admin create use-case (server). Stored dates are free text, so new values
// follow the separator/order style most common among existing values.

export type CertificateDateStyle = { order: 'ymd' | 'dmy'; separator: string }
export type CertificateDateParts = { year: number; month: number; day: number }

// Certificates are issued in India; "today" is the Asia/Kolkata calendar day
// regardless of the server's own timezone.
export const CERTIFICATE_DATE_TIME_ZONE = 'Asia/Kolkata'

export function dominantDateStyle(known: string[]): CertificateDateStyle {
  const tally = new Map<string, number>()
  for (const value of known) {
    const m = value.trim().match(/^(\d{1,4})([-/.])(\d{1,2})[-/.](\d{1,4})$/)
    if (!m) continue
    const key = `${m[1].length === 4 ? 'ymd' : 'dmy'}${m[2]}`
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!top) return { order: 'dmy', separator: '-' }
  return { order: top.startsWith('ymd') ? 'ymd' : 'dmy', separator: top.slice(3) }
}

export function formatCertificateDate({ year, month, day }: CertificateDateParts, style: CertificateDateStyle) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return style.order === 'ymd'
    ? [year, pad(month), pad(day)].join(style.separator)
    : [pad(day), pad(month), year].join(style.separator)
}

export function certificateDateToday(now: Date = new Date()): CertificateDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CERTIFICATE_DATE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: pick('year'), month: pick('month'), day: pick('day') }
}
