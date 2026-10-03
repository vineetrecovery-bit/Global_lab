const PUBLIC_FIELDS = ['PRODUCT_NAME', 'CATEGORY'] as const

export function toPublicCertificate(row: Record<string, unknown>) {
  const certificateNo = String(row.CERTIFICATE_NO || '')
  const certificate: Record<string, string> = {
    CERTIFICATE_NO: certificateNo,
    Certificate_photograph: '',
  }

  if (row.r2_object_key) {
    const version = versionForRow(row)
    certificate.Certificate_photograph =
      `/api/certificates/${encodeURIComponent(certificateNo)}/image${version ? `?v=${encodeURIComponent(version)}` : ''}`
  }

  for (const key of PUBLIC_FIELDS) {
    const value = row[key]
    if (value == null) continue
    certificate[key] = String(value)
  }

  return certificate
}

function versionForRow(row: Record<string, unknown>) {
  const value = row.updated_at || row.appwrite_updated_at
  if (!value) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}
