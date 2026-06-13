'use client'

import { useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { findCertificate, type Certificate } from '@/lib/certificates'
import { CertificateResult } from '@/components/certificate-result'

export function Hero() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<Certificate | 'not-found' | null>(null)
  const [loading, setLoading] = useState(false)

  const handleVerify = (e: FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setResult(null)
    setTimeout(() => {
      const found = findCertificate(query)
      setResult(found ?? 'not-found')
      setLoading(false)
    }, 900)
  }

  return (
    <section id="home" className="relative overflow-hidden bg-primary">
      <div className="absolute inset-0">
        <img
          src="/hero-lab.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/70 via-primary/85 to-primary" />
      </div>

      <div
        id="verification"
        className="relative mx-auto max-w-5xl px-6 pb-24 pt-40 text-center lg:px-10 lg:pt-48"
      >
        <p className="animate-fade-up text-[0.75rem] tracking-luxury text-gold">
          INTERNATIONAL CERTIFICATION AUTHORITY
        </p>
        <span className="gold-line mx-auto mt-6 block h-px w-24" />

        <h1 className="animate-fade-up font-heading mt-7 text-balance text-4xl font-semibold leading-[1.1] text-primary-foreground sm:text-6xl lg:text-7xl">
          Scientific Authentication
          <span className="block text-gold">{'& Certification'}</span>
        </h1>

        <p className="animate-fade-up mx-auto mt-7 max-w-2xl text-pretty text-base font-light leading-relaxed text-primary-foreground/70 sm:text-lg">
          Trusted verification and certification for Rudraksha and Gemstones —
          backed by rigorous laboratory standards and transparent documentation.
        </p>

        <form
          onSubmit={handleVerify}
          className="glass-dark animate-fade-up mx-auto mt-12 flex max-w-2xl flex-col gap-3 rounded-lg p-3 sm:flex-row"
        >
          <div className="flex flex-1 items-center gap-3 rounded-md bg-background/5 px-4">
            <Search className="h-5 w-5 shrink-0 text-gold" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter Verification Number"
              aria-label="Verification number"
              className="w-full bg-transparent py-4 text-primary-foreground placeholder:text-primary-foreground/40 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gold px-8 py-4 text-sm font-medium tracking-wide text-gold-foreground transition-all duration-300 hover:brightness-110 disabled:opacity-60"
          >
            {loading ? 'Verifying…' : 'Verify Certificate'}
          </button>
        </form>

        <p className="animate-fade-up mt-4 text-xs text-primary-foreground/40">
          Try a sample: GL-RUD-2024-0001 · GL-EMR-2024-0042 · GL-RUB-2024-0118
        </p>

        <div className="mx-auto max-w-3xl text-left">
          <CertificateResult result={result} />
        </div>
      </div>
    </section>
  )
}
