import { Reveal } from '@/components/reveal'

const steps = [
  {
    step: '01',
    title: 'Enter Verification Number',
    text: 'Input the unique certificate number printed on your Global Lab document.',
  },
  {
    step: '02',
    title: 'System Searches Database',
    text: 'Our secure global registry is queried in real time for a matching record.',
  },
  {
    step: '03',
    title: 'Certificate Retrieved',
    text: 'The authenticated specimen record is located and prepared for display.',
  },
  {
    step: '04',
    title: 'Verification Result Displayed',
    text: 'Full certificate details and verification status are presented instantly.',
  },
]

export function VerificationProcess() {
  return (
    <section className="relative overflow-hidden bg-primary py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <Reveal className="text-center">
          <p className="text-[0.75rem] tracking-luxury text-gold">
            HOW VERIFICATION WORKS
          </p>
          <h2 className="font-heading mx-auto mt-4 max-w-2xl text-balance text-4xl font-semibold text-primary-foreground sm:text-5xl">
            Verified in four simple steps
          </h2>
          <span className="gold-line mx-auto mt-6 block h-px w-24" />
        </Reveal>

        <ol className="mt-16 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <Reveal key={s.step} delay={i * 120}>
              <li className="relative">
                <div className="flex items-center gap-4">
                  <span className="font-heading flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gold/40 text-xl font-semibold text-gold">
                    {s.step}
                  </span>
                  {i < steps.length - 1 && (
                    <span className="hidden h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent lg:block" />
                  )}
                </div>
                <h3 className="font-heading mt-6 text-xl font-semibold text-primary-foreground">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-primary-foreground/60">
                  {s.text}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
