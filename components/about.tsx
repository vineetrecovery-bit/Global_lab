import Image from 'next/image'
import { Reveal } from '@/components/reveal'

const points = [
  {
    title: 'Laboratory Authentication',
    text: 'Every specimen undergoes systematic scientific examination using calibrated instruments and established gemological protocols.',
  },
  {
    title: 'Documentation',
    text: 'Detailed records of physical, optical, and structural properties are captured for full traceability of each certified item.',
  },
  {
    title: 'Verification Process',
    text: 'Each certificate is assigned a unique number, retrievable instantly through our secure global verification database.',
  },
  {
    title: 'Transparency',
    text: 'Our findings are presented objectively and without commercial interest — we authenticate, we never sell.',
  },
]

export function About() {
  return (
    <section id="about" className="bg-background py-24 lg:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-2 lg:px-10">
        <Reveal>
          <div className="relative">
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-border">
              <Image
                src="/about-lab.png"
                alt="Gemologist examining a stone under a microscope at Global Lab"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 600px"
              />
            </div>

          </div>
        </Reveal>

        <div>
          <Reveal>
            <p className="text-[0.75rem] tracking-luxury text-gold">
              ABOUT GLOBAL LAB
            </p>
            <h2 className="font-heading mt-4 text-balance text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
              A standard of trust the world relies upon
            </h2>
            <p className="mt-6 text-pretty leading-relaxed text-muted-foreground">
              Global Lab is an independent authentication and certification
              authority dedicated to Rudraksha beads and precious gemstones. We
              exist to bring scientific clarity, integrity, and confidence to
              every certified specimen — empowering collectors, institutions,
              and individuals to verify authenticity with absolute certainty.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
            {points.map((p, i) => (
              <Reveal key={p.title} delay={i * 100}>
                <div className="h-full bg-card p-6">
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {p.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
