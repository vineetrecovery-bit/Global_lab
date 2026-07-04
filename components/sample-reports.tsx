import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'
import { Reveal } from '@/components/reveal'

const certificates = [
  {
    number: 'GL-2025-00142',
    productName: 'Nepal 7 Mukhi Rudraksha',
    category: 'Rudraksha',
    origin: 'Nepal',
    image: '/report-rudraksha.png',
    mukhi: '7',
    weight: '12.4 g',
    issueDate: '15 Jan 2025',
  },
  {
    number: 'GL-2025-00098',
    productName: 'Indonesian 5 Mukhi Rudraksha',
    category: 'Rudraksha',
    origin: 'Indonesia',
    image: '/report-emerald.png',
    mukhi: '5',
    weight: '8.7 g',
    issueDate: '03 Feb 2025',
  },
  {
    number: 'GL-2025-00217',
    productName: 'Nepal 14 Mukhi Rudraksha',
    category: 'Rudraksha',
    origin: 'Nepal',
    image: '/report-ruby.png',
    mukhi: '14',
    weight: '18.2 g',
    issueDate: '21 Feb 2025',
  },
]

export function SampleReports() {
  return (
    <section id="reports" className="bg-background py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <Reveal className="text-center">
          <p className="text-[0.75rem] tracking-luxury text-gold">
            SAMPLE REPORTS
          </p>
          <h2 className="font-heading mx-auto mt-4 max-w-2xl text-balance text-4xl font-semibold text-foreground sm:text-5xl">
            Certificates issued with precision
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            A selection of verified specimens. Each report is permanently
            registered and retrievable through our verification system.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {certificates.map((cert, i) => (
            <Reveal key={cert.number} delay={i * 120}>
              <article className="group h-full overflow-hidden rounded-lg border border-border bg-card transition-all duration-500 hover:-translate-y-1 hover:border-gold/50 hover:shadow-2xl hover:shadow-black/10">
                <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
                  <Image
                    src={cert.image || '/placeholder.svg'}
                    alt={cert.productName}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 380px"
                  />
                  <span className="glass-dark absolute left-4 top-4 rounded-full px-3 py-1 text-[0.65rem] tracking-luxury text-gold">
                    {cert.category.toUpperCase()}
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="font-heading text-xl font-semibold text-foreground">
                    {cert.productName}
                  </h3>
                  <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
                    {cert.number}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                    <span className="text-xs text-muted-foreground">
                      {cert.weight} · {cert.issueDate}
                    </span>
                    <a
                      href="#verification"
                      className="flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-gold"
                    >
                      View Report
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}