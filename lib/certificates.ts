export type Certificate = {
  number: string
  productName: string
  origin: string
  weight: string
  issueDate: string
  image: string
  category: 'Rudraksha' | 'Gemstone'
}

export const certificates: Certificate[] = [
  {
    number: 'GL-RUD-2024-0001',
    productName: '5 Mukhi Rudraksha',
    origin: 'Nepal, Himalayan Region',
    weight: '1.84 ct',
    issueDate: '12 March 2024',
    image: '/report-rudraksha.png',
    category: 'Rudraksha',
  },
  {
    number: 'GL-EMR-2024-0042',
    productName: 'Natural Emerald (Panna)',
    origin: 'Colombia, Muzo Mines',
    weight: '3.27 ct',
    issueDate: '28 June 2024',
    image: '/report-emerald.png',
    category: 'Gemstone',
  },
  {
    number: 'GL-RUB-2024-0118',
    productName: 'Natural Ruby (Manik)',
    origin: 'Myanmar, Mogok Valley',
    weight: '2.55 ct',
    issueDate: '04 September 2024',
    image: '/report-ruby.png',
    category: 'Gemstone',
  },
]

export function findCertificate(input: string): Certificate | null {
  const query = input.trim().toUpperCase()
  if (!query) return null
  return (
    certificates.find((c) => c.number.toUpperCase() === query) ?? null
  )
}
