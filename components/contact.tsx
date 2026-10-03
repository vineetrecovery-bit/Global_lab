import { MapPin, Mail } from 'lucide-react'
import { Reveal } from '@/components/reveal'

const contactEmail = 'Globallab.info.in@gmail.com'
const contactHref =
  `mailto:${contactEmail}?subject=${encodeURIComponent('Global Lab certification enquiry')}`

const info = [
  {
    icon: MapPin,
    label: 'Address',
    value: 'Global LabJaipur, Rajasthan, India',
  },
  { icon: Mail, label: 'Email', value: contactEmail },
]

export function Contact() {
  return (
    <section id="contact" className="bg-background py-24 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-2 lg:px-10">
        <Reveal>
          <p className="text-[0.75rem] tracking-luxury text-gold">CONTACT</p>
          <h2 className="font-heading mt-4 text-balance text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Speak with our certification team
          </h2>
          <p className="mt-6 max-w-md text-pretty leading-relaxed text-muted-foreground">
            For verification support, certification enquiries, or institutional
            partnerships, our specialists are available to assist you.
          </p>

          <ul className="mt-10 space-y-6">
            {info.map((item) => (
              <li key={item.label} className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-gold/40 bg-gold/5">
                  <item.icon className="h-5 w-5 text-gold" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-luxury text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-1 font-medium text-foreground">
                    {item.value}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={150}>
          <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Send your enquiry directly to our certification team. Your email
              app will open with the laboratory address and subject filled in.
            </p>
            <a
              href={contactHref}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-4 text-sm font-medium tracking-wide text-primary-foreground transition-all duration-300 hover:bg-gold hover:text-gold-foreground"
            >
              <Mail className="h-4 w-4" /> Email Certification Team
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
