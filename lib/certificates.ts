export type Certificate = {
  'CERTIFICATE_NO': string
  Certificate_photograph: string
  [key: string]: string
}

export type VerificationFailure = 'not-found' | 'invalid' | 'unauthorized' | 'conflict' | 'unavailable'

export class CertificateVerificationError extends Error {
  constructor(readonly kind: Exclude<VerificationFailure, 'not-found'>) {
    super('Certificate verification failed')
    this.name = 'CertificateVerificationError'
  }
}

export async function findCertificate(
  input: string
): Promise<Certificate | null> {
  const certificateNo = input.trim()
  if (!certificateNo) return null

  const response = await fetch(
    `/api/certificates/verify?certificateNo=${encodeURIComponent(certificateNo)}`,
    { cache: 'no-store' }
  )

  if (response.status === 404) return null
  if (!response.ok) {
    const kind = response.status === 400
      ? 'invalid'
      : response.status === 401 || response.status === 403
        ? 'unauthorized'
        : response.status === 409
          ? 'conflict'
          : 'unavailable'
    throw new CertificateVerificationError(kind)
  }

  const data = (await response.json()) as { certificate: Certificate | null }
  return data.certificate
}
