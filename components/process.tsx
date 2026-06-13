import { Reveal } from '@/components/reveal'
import { Microscope, ScanEye, FileText, Award } from 'lucide-react'

const steps = [
  {
    icon: ScanEye,
    title: 'Physical Examination',
    text: 'Dimensions, weight, color, and surface characteristics are precisely measured and recorded.',
  },
  {
    icon: Microscope,
    title: 'Microscopic Observation',
    text: 'High-magnification analysis reveals internal structure, inclusions, and natural formation markers.',
  },
  {
    icon: FileText,
    title: 'Analysis & Documentation',
    text: 'Findings are cross-referenced against gemological standards and compiled into a verified record.',
  },
  {
    icon: Award,
    title: 'Certificate Issuance',
    text: 'A unique, tamper-evident certificate is issued and registered in our global verification database.',
  },
]

export function Process() {
  return (
    <section className="bg-card py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <Reveal className="text-center">
          <p className="text-[0.75rem] tracking-luxury text-gold">
            OUR METHODOLOGY
          </p>
          <h2 className="font-heading mx-auto mt-4 max-w-2xl text-balance text-4xl font-semibold text-foreground sm:text-5xl">
            A rigorous four-stage testing process
          </h2>
          <span className="gold-line mx-auto mt-6 block h-px w-24" />
        </Reveal>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 120}>
              <div className="group relative h-full overflow-hidden rounded-lg border border-border bg-background p-8 transition-all duration-500 hover:border-gold/50 hover:shadow-xl hover:shadow-black/5">
                <span className="font-heading absolute right-6 top-5 text-5xl font-semibold text-secondary transition-colors group-hover:text-gold/15">
                  0{i + 1}
                </span>
                <div className="flex h-14 w-14 items-center justify-center rounded-md border border-gold/40 bg-gold/5">
                  <step.icon className="h-6 w-6 text-gold" />
                </div>
                <h3 className="font-heading mt-6 text-xl font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
