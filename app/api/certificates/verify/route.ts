import { NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import { getMysqlPool } from '@/lib/mysql'

export const runtime = 'nodejs'

const HIDDEN_FIELDS = new Set([
  'id',
  'appwrite_document_id',
  'Certificate_photograph',
  'r2_object_key',
  'appwrite_created_at',
  'appwrite_updated_at',
  'created_at',
  'updated_at',
])

type CertificateRow = RowDataPacket & {
  CERTIFICATE_NO: string
  r2_object_key: string | null
}

function toPublicCertificate(row: CertificateRow) {
  const certificateNo = String(row.CERTIFICATE_NO || '')
  const certificate: Record<string, string> = {
    CERTIFICATE_NO: certificateNo,
    Certificate_photograph: '',
  }

  if (row.r2_object_key) {
    certificate.Certificate_photograph = `/api/certificates/${encodeURIComponent(certificateNo)}/image`
  }

  for (const [key, value] of Object.entries(row)) {
    if (HIDDEN_FIELDS.has(key)) continue
    if (value == null) continue
    certificate[key] = String(value)
  }

  return certificate
}

export async function GET(request: NextRequest) {
  const certificateNo = request.nextUrl.searchParams.get('certificateNo')?.trim()

  if (!certificateNo) {
    return NextResponse.json({ error: 'Certificate number required' }, { status: 400 })
  }

  try {
    const [rows] = await getMysqlPool().execute<CertificateRow[]>(
      'SELECT * FROM `certificates` WHERE `CERTIFICATE_NO` = :certificateNo LIMIT 1',
      { certificateNo }
    )

    if (rows.length === 0) {
      return NextResponse.json({ certificate: null }, { status: 404 })
    }

    return NextResponse.json({
      certificate: toPublicCertificate(rows[0]),
    })
  } catch (error) {
    console.error('MySQL :: verify certificate error:', error)
    return NextResponse.json({ error: 'Failed to verify certificate' }, { status: 500 })
  }
}
