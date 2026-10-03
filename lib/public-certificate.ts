// Keep this list explicit: database metadata and newly-added columns must never
// become public certificate data by accident. This is the reviewed certificate
// attribute set retained in the migration schema metadata.
const PUBLIC_FIELDS = [
  'TYPE',
  'CATEGORY',
  'PRODUCT_NAME',
  'WEIGHT',
  'DIMENSIONS',
  'SHAPE',
  'CUT',
  'COLOR',
  'MATERIAL',
  'CONSTRUCTION',
  'ORIGIN',
  'TREATMENT',
  'COMMENTS',
  'CERTIFICATE_DATE',
  'BOTANICAL_NAME',
  'WOOD_TYPE',
  'MUKHI',
  'NATURAL_FACES',
  'ARTIFICIAL_FACES',
  'SURFACE_TEXTURE',
  'GEM_VARIETY',
  'TRANSPARENCY',
  'LUSTER',
] as const

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
    if (value == null || String(value).trim() === '') continue
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
