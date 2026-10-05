import { NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import { jsonError, jsonOk, requestId } from '@/lib/http-response'
import { getMysqlPool } from '@/lib/mysql'
import { toPublicCertificate } from '@/lib/public-certificate'
import { runtimeLog } from '@/lib/runtime-log'

export const runtime = 'nodejs'

type CertificateRow = RowDataPacket & {
  CERTIFICATE_NO: string
  r2_object_key: string | null
}

export async function GET(request: NextRequest) {
  const id = requestId()
  const startedAt = Date.now()
  const certificateNo = request.nextUrl.searchParams.get('certificateNo')?.trim()

  if (!certificateNo) {
    runtimeLog('certificate.verify', {
      requestId: id,
      outcome: 'invalid_request',
      durationMs: Date.now() - startedAt,
    }, 'warn')
    return jsonError('Certificate number required', 400, id)
  }

  try {
    const [rows] = await getMysqlPool().execute<CertificateRow[]>(
      'SELECT * FROM `certificates` WHERE `CERTIFICATE_NO` = :certificateNo LIMIT 2',
      { certificateNo }
    )

    if (rows.length === 0) {
      runtimeLog('certificate.verify', {
        requestId: id,
        certificateNo,
        outcome: 'not_found',
        durationMs: Date.now() - startedAt,
      })
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
      runtimeLog('certificate.verify', {
        requestId: id,
        certificateNo,
        outcome: 'duplicate',
        durationMs: Date.now() - startedAt,
      }, 'warn')
      return jsonError('Certificate number is not unique', 409, id)
    }

    const certificate = toPublicCertificate(rows[0])
    const verifiedFields = Object.keys(certificate).filter(
      (field) => field !== 'CERTIFICATE_NO' && field !== 'Certificate_photograph'
    )
    runtimeLog('certificate.verify', {
      requestId: id,
      certificateNo,
      outcome: 'verified',
      verifiedFieldCount: verifiedFields.length,
      verifiedFields,
      hasImage: Boolean(certificate.Certificate_photograph),
      durationMs: Date.now() - startedAt,
    })

    return jsonOk({
      certificate,
    }, id)
  } catch (error) {
    runtimeLog('certificate.verify', {
      requestId: id,
      certificateNo,
      outcome: 'service_error',
      errorType: error instanceof Error ? error.name : 'UnknownError',
      durationMs: Date.now() - startedAt,
    }, 'error')
    return jsonError('Certificate service is temporarily unavailable', 503, id)
  }
}
