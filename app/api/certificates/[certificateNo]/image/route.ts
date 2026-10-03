import { NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import { jsonError, requestId } from '@/lib/http-response'
import { getMysqlPool } from '@/lib/mysql'
import { contentTypeForObjectKey, fetchR2Object } from '@/lib/r2'

export const runtime = 'nodejs'

type CertificateImageRow = RowDataPacket & {
  r2_object_key: string | null
}

function certificateNoFromPath(request: NextRequest): string {
  const prefix = '/api/certificates/'
  const suffix = '/image'
  const pathname = request.nextUrl.pathname

  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return ''

  return decodeURIComponent(pathname.slice(prefix.length, -suffix.length))
}

export async function GET(request: NextRequest) {
  const id = requestId()
  const certificateNo = certificateNoFromPath(request).trim()

  if (!certificateNo) {
    return jsonError('Certificate number required', 400, id)
  }

  try {
    const [rows] = await getMysqlPool().execute<CertificateImageRow[]>(
      'SELECT `r2_object_key` FROM `certificates` WHERE `CERTIFICATE_NO` = :certificateNo LIMIT 2',
      { certificateNo }
    )

    if (rows.length > 1) {
      return jsonError('Certificate number is not unique', 409, id)
    }

    const objectKey = rows[0]?.r2_object_key

    if (!objectKey) {
      return jsonError('Image not found', 404, id)
    }

    const r2Response = await fetchR2Object({ objectKey })

    if (r2Response.status === 404) {
      return jsonError('Image not found', 404, id)
    }

    if (!r2Response.ok) {
      console.error('R2 :: certificate image upstream error:', {
        requestId: id,
        status: r2Response.status,
      })
      return jsonError('Image service is temporarily unavailable', 502, id)
    }

    return new NextResponse(r2Response.body, {
      headers: {
        'X-Request-ID': id,
        'Content-Type': contentTypeForObjectKey(objectKey),
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': request.nextUrl.searchParams.has('v')
          ? 'public, max-age=31536000, immutable'
          : 'no-store',
      },
    })
  } catch (error) {
    console.error('R2 :: certificate image error:', { requestId: id, error })
    return jsonError('Image service is temporarily unavailable', 503, id)
  }
}
