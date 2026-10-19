import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CertificateResult } from '@/components/certificate-result'

describe('certificate verification result', () => {
  it('shows a retry instruction when verification is unavailable', () => {
    const html = renderToStaticMarkup(createElement(CertificateResult, { result: 'unavailable' }))

    expect(html).toContain('Verification Unavailable')
    expect(html).toContain('try again')
    expect(html).not.toContain('Match Not Found')
  })

  it('shows a contact instruction for a conflicting record', () => {
    const html = renderToStaticMarkup(createElement(CertificateResult, { result: 'conflict' }))

    expect(html).toContain('Record Conflict')
    expect(html).toContain('contact')
  })

  it.each([
    ['not-found', 'Match Not Found'],
    ['invalid', 'Invalid Number'],
    ['unauthorized', 'Verification Restricted'],
  ] as const)('renders %s separately', (result, heading) => {
    const html = renderToStaticMarkup(createElement(CertificateResult, { result }))

    expect(html).toContain(heading)
    expect(html).not.toContain('>VERIFIED<')
  })
})
