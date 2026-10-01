export type Certificate = {
  'CERTIFICATE_NO': string
  Certificate_photograph: string
  [key: string]: string
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
    throw new Error('Failed to verify certificate')
  }

  const data = (await response.json()) as { certificate: Certificate | null }
  return data.certificate
}
