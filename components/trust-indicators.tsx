import { Counter } from '@/components/counter'
import { Reveal } from '@/components/reveal'

const stats = [
  { value: 50000, suffix: '+', label: 'Certificates Verified' },
  { value: 100, suffix: '%', label: 'Laboratory Standards' },
  { value: 99.8, suffix: '%', decimals: 1, label: 'Report Accuracy' },
  { value: 99.9, suffix: '%', decimals: 1, label: 'authentication success rate' },
]

export function TrustIndicators() {
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Reveal key={stat.label} delay={i * 120}>
            <div className="flex h-full flex-col items-center justify-center bg-card px-6 py-12 text-center">
              <p className="font-heading text-4xl font-semibold text-foreground sm:text-5xl">
                <Counter
                  value={stat.value}
                  suffix={stat.suffix}
                  decimals={stat.decimals ?? 0}
                />
              </p>
              <span className="mt-2 h-px w-8 bg-gold" />
              <p className="mt-3 text-xs uppercase tracking-luxury text-muted-foreground">
                {stat.label}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
