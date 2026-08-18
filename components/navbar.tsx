'use client'

import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'

const links = [
  { label: 'Home', href: '/' },
  { label: 'Verification', href: '/#verification' },
  { label: 'Sample Reports', href: '/#reports' },
  { label: 'About', href: '/#about' },
  { label: 'Contact', href: '/#contact' },
]

// Sections with dark backgrounds
const darkSections = ['home', 'verification', 'verification-process']

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [isDark, setIsDark] = useState(true)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const sectionIds = ['home', 'verification', 'reports', 'about', 'contact', 'verification-process']

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id
            setIsDark(darkSections.includes(id))
          }
        })
      },
      { threshold: 0.3 }
    )

    sectionIds.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    observerRef.current = observer
    return () => observer.disconnect()
  }, [])

  const textClass = isDark ? 'text-background/80' : 'text-foreground/80'
  const textHoverClass = isDark ? 'hover:text-gold' : 'hover:text-gold'
  const logoTextClass = isDark ? 'text-background' : 'text-foreground'
  const lineClass = isDark ? 'bg-background' : 'bg-foreground'
  const navBg = scrolled
    ? isDark
      ? 'glass-dark py-3 shadow-lg shadow-black/20'
      : 'glass py-3 shadow-lg shadow-black/5'
    : 'bg-transparent py-5'
  const mobileBg = isDark ? 'glass-dark' : 'glass'

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-500',
        navBg,
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-10">
        <a href="#home" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-sm border border-gold/60">
            <img src="/apple-icon.png" alt="Global Lab" className="h-full w-full object-cover" />
          </span>
          <span className={cn('font-heading text-xl font-semibold tracking-[0.18em] transition-colors duration-500', logoTextClass)}>
            GLOBAL LAB
          </span>
        </a>

        <ul className="hidden items-center gap-9 lg:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className={cn(
                  'group relative text-sm font-light tracking-wide transition-colors duration-500',
                  textClass,
                  textHoverClass,
                )}
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
              'h-px w-6 transition-all duration-300',
              lineClass,
              open && 'translate-y-[7px] rotate-45',
            )}
          />
          <span
            className={cn(
              'h-px w-6 transition-all duration-300',
              lineClass,
              open && 'opacity-0',
            )}
          />
          <span
            className={cn(
              'h-px w-6 transition-all duration-300',
              lineClass,
              open && '-translate-y-[7px] -rotate-45',
            )}
          />
        </button>
      </nav>

      {open && (
        <div className={cn('mt-3 lg:hidden', mobileBg)}>
          <ul className="flex flex-col px-6 py-4">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'block py-3 text-sm font-light tracking-wide transition-colors duration-500',
                    textClass,
                    textHoverClass,
                  )}
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