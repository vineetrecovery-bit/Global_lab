import { NextRequest, NextResponse } from 'next/server'
import {
  AdminCertificateConflictError,
  AdminCertificateInputError,
  AdminCertificateNotFoundError,
  AdminCertificateRevisionConflictError,
} from '@/lib/admin-certificates'
import { fixCertificateImageQr, QrFixError, QrFixSourceError } from '@/lib/admin-certificate-qr-fix'
import { requireAdmin } from '@/lib/admin-auth'
import { jsonError, requestId } from '@/lib/http-response'
import { UploadValidationError } from '@/lib/upload-validation'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  const rid = requestId()
  const match = request.nextUrl.pathname.match(/\/api\/admin\/certificates\/(\d+)\/fix-qr$/)
  const id = match ? Number(match[1]) : 0
  if (!id) return jsonError('Invalid certificate id', 400, rid)

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    body = parsed as Record<string, unknown>
  } catch {
    return jsonError('Request body must be a JSON object', 400, rid)
  }

  const mode = body.mode
  if (mode !== 'preview' && mode !== 'apply') return jsonError('mode must be "preview" or "apply"', 400, rid)
  const region = parseRegion(body.region)
  if (region === 'invalid') return jsonError('region must be {x, y, size} in whole pixels', 400, rid)
  if (body.expectedRevision !== undefined && typeof body.expectedRevision !== 'string') {
    return jsonError('expectedRevision must be a string', 400, rid)
  }

  try {
    const outcome = await fixCertificateImageQr({
      id,
      apply: mode === 'apply',
      region: region ?? undefined,
      expectedRevision: body.expectedRevision as string | undefined,
    })
    return NextResponse.json(outcome, { headers: { 'X-Request-ID': rid, 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof QrFixError) {
      return NextResponse.json({ error: error.message, code: error.code, requestId: rid }, { status: 422 })
    }
    if (error instanceof QrFixSourceError) {
      const status = error.code === 'storage_unavailable' ? 503 : 422
      return NextResponse.json({ error: error.message, code: error.code, requestId: rid }, { status })
    }
    if (error instanceof AdminCertificateNotFoundError) return jsonError(error.message, 404, rid)
    if (
      error instanceof AdminCertificateConflictError ||
      error instanceof AdminCertificateRevisionConflictError
    ) {
      return NextResponse.json({ error: error.message, code: 'conflict', requestId: rid }, { status: 409 })
    }
    if (error instanceof AdminCertificateInputError || error instanceof UploadValidationError) {
      return jsonError(error.message, 400, rid)
    }
    console.error('Admin certificates :: fix-qr error:', {
      requestId: rid,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return jsonError('Failed to fix certificate QR', 500, rid)
  }
}

function parseRegion(value: unknown) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return 'invalid' as const
  const { x, y, size } = value as Record<string, unknown>
  if (![x, y, size].every((n) => typeof n === 'number' && Number.isInteger(n))) return 'invalid' as const
  return { x: x as number, y: y as number, size: size as number }
}
