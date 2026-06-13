const links = [
  { label: 'Home', href: '#home' },
  { label: 'Verification', href: '#verification' },
  { label: 'Sample Reports', href: '#reports' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

export function Footer() {
  return (
    <footer className="border-t border-gold/20 bg-primary">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-gold/60">
                <span className="font-heading text-lg font-semibold text-gold">
                  G
                </span>
              </span>
              <span className="font-heading text-xl font-semibold tracking-[0.18em] text-primary-foreground">
                GLOBAL LAB
              </span>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-primary-foreground/50">
              An independent international authority for the scientific
              authentication and certification of Rudraksha and Gemstones.
            </p>
          </div>

          <nav aria-label="Footer">
            <p className="text-xs uppercase tracking-luxury text-gold">
              Navigation
            </p>
            <ul className="mt-5 space-y-3">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-primary-foreground/60 transition-colors hover:text-gold"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-primary-foreground/10 pt-8 sm:flex-row">
          <p className="text-xs text-primary-foreground/40">
            © {new Date().getFullYear()} Global Lab. All rights reserved.
          </p>
          <p className="text-xs tracking-luxury text-primary-foreground/40">
            SCIENTIFIC CERTIFICATION AUTHORITY
          </p>
        </div>
      </div>
    </footer>
  )
}
