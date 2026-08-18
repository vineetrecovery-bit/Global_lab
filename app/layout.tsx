import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, Jost } from 'next/font/google'
import './globals.css'

const cormorant = Cormorant_Garamond({
  variable: '--font-heading',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})
const jost = Jost({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'Global Lab — Scientific Authentication & Certification',
  description:
    'Trusted scientific verification and certification for Rudraksha and Gemstones. Verify certificates, view sample reports, and explore our laboratory standards.',
  generator: 'v0.app',
  keywords: [
    'Rudraksha certification',
    'Gemstone authentication',
    'certificate verification',
    'gemology laboratory',
    'Global Lab',
  ],
  openGraph: {
    title: 'Global Lab — Scientific Authentication & Certification',
    description:
      'Trusted scientific verification and certification for Rudraksha and Gemstones.',
    type: 'website',
  },
  icons: {
    icon: [
      {
        url: '/apple-icon.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/apple-icon.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${jost.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
