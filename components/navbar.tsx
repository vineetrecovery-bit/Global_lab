'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const links = [
  { label: 'Home', href: '#home' },
  { label: 'Verification', href: '#verification' },
  { label: 'Sample Reports', href: '#reports' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-500',
        scrolled
          ? 'glass-dark py-3 shadow-lg shadow-black/20'
          : 'bg-transparent py-5',
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-10">
        <a href="#home" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-gold/60">
            <span className="font-heading text-lg font-semibold text-gold">
              G
            </span>
          </span>
          <span className="font-heading text-xl font-semibold tracking-[0.18em] text-background">
            GLOBAL LAB
          </span>
        </a>

        <ul className="hidden items-center gap-9 lg:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="group relative text-sm font-light tracking-wide text-background/80 transition-colors hover:text-gold"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-gold transition-all duration-300 group-hover:w-full" />
              </a>
            </li>
          ))}
        </ul>

        <a
          href="#verification"
          className="hidden rounded-sm border border-gold/60 px-5 py-2 text-xs font-medium tracking-luxury text-gold transition-all duration-300 hover:bg-gold hover:text-gold-foreground lg:inline-block"
        >
          VERIFY
        </a>

        <button
          type="button"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-col gap-1.5 lg:hidden"
        >
          <span
            className={cn(
              'h-px w-6 bg-background transition-all',
              open && 'translate-y-[7px] rotate-45',
            )}
          />
          <span
            className={cn(
              'h-px w-6 bg-background transition-all',
              open && 'opacity-0',
            )}
          />
          <span
            className={cn(
              'h-px w-6 bg-background transition-all',
              open && '-translate-y-[7px] -rotate-45',
            )}
          />
        </button>
      </nav>

      {open && (
        <div className="glass-dark mt-3 lg:hidden">
          <ul className="flex flex-col px-6 py-4">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block py-3 text-sm font-light tracking-wide text-background/80 transition-colors hover:text-gold"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  )
}
