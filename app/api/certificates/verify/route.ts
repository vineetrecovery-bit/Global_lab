import { NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import { jsonError, jsonOk, requestId } from '@/lib/http-response'
import { getMysqlPool } from '@/lib/mysql'
import { toPublicCertificate } from '@/lib/public-certificate'

export const runtime = 'nodejs'

type CertificateRow = RowDataPacket & {
  CERTIFICATE_NO: string
  r2_object_key: string | null
}

export async function GET(request: NextRequest) {
  const id = requestId()
  const certificateNo = request.nextUrl.searchParams.get('certificateNo')?.trim()

  if (!certificateNo) {
    return jsonError('Certificate number required', 400, id)
  }

  try {
    const [rows] = await getMysqlPool().execute<CertificateRow[]>(
      'SELECT * FROM `certificates` WHERE `CERTIFICATE_NO` = :certificateNo LIMIT 2',
      { certificateNo }
    )

    if (rows.length === 0) {
      return NextResponse.json(
        { certificate: null, requestId: id },
        {
          status: 404,
          headers: {
            'X-Request-ID': id,
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    if (rows.length > 1) {
      return jsonError('Certificate number is not unique', 409, id)
    }

    return jsonOk({
      certificate: toPublicCertificate(rows[0]),
    }, id)
  } catch (error) {
    console.error('MySQL :: verify certificate error:', { requestId: id, error })
    return jsonError('Certificate service is temporarily unavailable', 503, id)
  }
}
