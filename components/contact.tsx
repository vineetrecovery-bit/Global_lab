'use client'

import { useState, type FormEvent } from 'react'
import { MapPin, Mail, Check } from 'lucide-react'
import { Reveal } from '@/components/reveal'

const info = [
  {
    icon: MapPin,
    label: 'Address',
    value: 'Global LabJaipur, Rajasthan, India',
  },
  { icon: Mail, label: 'Email', value: 'Globallab.info.in@gmail.com' },
]

export function Contact() {
  const [sent, setSent] = useState(false)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setSent(true)
    setTimeout(() => setSent(false), 4000)
  }

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
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-border bg-card p-8 shadow-sm"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full Name" id="name" placeholder="Your name" />
              <Field
                label="Email"
                id="email"
                type="email"
                placeholder="you@email.com"
              />
            </div>
            <div className="mt-5">
              <Field
                label="Subject"
                id="subject"
                placeholder="How can we help?"
              />
            </div>
            <div className="mt-5">
              <label
                htmlFor="message"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Message
              </label>
              <textarea
                id="message"
                rows={4}
                required
                placeholder="Write your message…"
                className="mt-2 w-full resize-none rounded-md border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
            <button
              type="submit"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-4 text-sm font-medium tracking-wide text-primary-foreground transition-all duration-300 hover:bg-gold hover:text-gold-foreground"
            >
              {sent ? (
                <>
                  <Check className="h-4 w-4" /> Message Sent
                </>
              ) : (
                'Send Message'
              )}
            </button>
          </form>
        </Reveal>
      </div>
    </section>
  )
}

function Field({
  label,
  id,
  type = 'text',
  placeholder,
}: {
  label: string
  id: string
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        required
        placeholder={placeholder}
        className="mt-2 w-full rounded-md border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
      />
    </div>
  )
}
