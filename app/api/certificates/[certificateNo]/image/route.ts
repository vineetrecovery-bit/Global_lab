import { NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
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
  const certificateNo = certificateNoFromPath(request).trim()

  if (!certificateNo) {
    return NextResponse.json({ error: 'Certificate number required' }, { status: 400 })
  }

  try {
    const [rows] = await getMysqlPool().execute<CertificateImageRow[]>(
      'SELECT `r2_object_key` FROM `certificates` WHERE `CERTIFICATE_NO` = :certificateNo LIMIT 1',
      { certificateNo }
    )
    const objectKey = rows[0]?.r2_object_key

    if (!objectKey) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const r2Response = await fetchR2Object({ objectKey })

    if (!r2Response.ok) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    return new NextResponse(r2Response.body, {
      headers: {
        'Content-Type': r2Response.headers.get('content-type') || contentTypeForObjectKey(objectKey),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('R2 :: certificate image error:', error)
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
  }
}
