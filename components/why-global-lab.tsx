import { Reveal } from '@/components/reveal'
import {
  Target,
  Eye,
  Fingerprint,
  ShieldCheck,
  FileCheck2,
  Stamp,
} from 'lucide-react'

const features = [
  {
    icon: Target,
    title: 'Accuracy',
    text: 'Calibrated instruments and disciplined methodology deliver consistently precise results.',
  },
  {
    icon: Eye,
    title: 'Transparency',
    text: 'Objective findings, presented clearly, with no commercial bias of any kind.',
  },
  {
    icon: Fingerprint,
    title: 'Authenticity',
    text: 'Each specimen is verified against rigorous gemological and natural-origin standards.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Verification',
    text: 'A protected global database guarantees every certificate is genuine and traceable.',
  },
  {
    icon: FileCheck2,
    title: 'Professional Documentation',
    text: 'Comprehensive, archival-grade records accompany every certified item.',
  },
  {
    icon: Stamp,
    title: 'Trusted Certification',
    text: 'Recognized by collectors and institutions across more than sixty countries.',
  },
]

export function WhyGlobalLab() {
  return (
    <section className="bg-card py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <Reveal className="text-center">
          <p className="text-[0.75rem] tracking-luxury text-gold">
            WHY GLOBAL LAB
          </p>
          <h2 className="font-heading mx-auto mt-4 max-w-2xl text-balance text-4xl font-semibold text-foreground sm:text-5xl">
            Principles that define our work
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 120}>
              <div className="group flex h-full gap-5 rounded-lg border border-border bg-background p-7 transition-all duration-500 hover:border-gold/50">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-gold/40 bg-gold/5 transition-colors group-hover:bg-gold/10">
                  <f.icon className="h-5 w-5 text-gold" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {f.text}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
