import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CertificateQrAction, CertificateQrDialog } from '@/components/certificate-qr-dialog'

describe('certificate QR admin UI', () => {
  it('shows a Generate QR action for a certificate row', () => {
    const html = renderToStaticMarkup(createElement(CertificateQrAction, { certificateNo: 'GL-123' }))

    expect(html).toContain('Generate QR')
    expect(html).not.toContain('disabled=""')
  })

  it('keeps the action visible but disabled for a row without a number', () => {
    const html = renderToStaticMarkup(createElement(CertificateQrAction, { certificateNo: null }))

    expect(html).toContain('Generate QR')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Certificate number is required')
  })

  it('shows the selected row number and exact verification URL', () => {
    const html = renderToStaticMarkup(createElement(CertificateQrDialog, {
      certificateNo: 'TEST/42',
      onClose: () => {},
    }))

    expect(html).toContain('TEST/42')
    expect(html).toContain('https://globallabtesting.in/?batch=TEST%2F42')
  })
})
