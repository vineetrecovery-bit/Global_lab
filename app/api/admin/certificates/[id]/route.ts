import { NextRequest, NextResponse } from 'next/server'
import {
  AdminCertificateConflictError,
  AdminCertificateInputError,
  AdminCertificateNotFoundError,
  AdminCertificateRevisionConflictError,
  deleteAdminCertificate,
  updateAdminCertificate,
} from '@/lib/admin-certificates'
import { requireAdmin } from '@/lib/admin-auth'
import { jsonError, requestId } from '@/lib/http-response'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  const requestIdentifier = requestId()
  const id = idFromPath(request)
  if (!id) return NextResponse.json({ error: 'Invalid certificate id' }, { status: 400 })

  try {
    const body = await request.json()
    const document = await updateAdminCertificate(id, body)
    return NextResponse.json({ document })
  } catch (error) {
    if (error instanceof AdminCertificateInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof AdminCertificateNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof AdminCertificateConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof AdminCertificateRevisionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('Admin certificates :: update error:', {
      requestId: requestIdentifier,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return jsonError('Failed to update certificate', 500, requestIdentifier)
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  const id = idFromPath(request)
  if (!id) return NextResponse.json({ error: 'Invalid certificate id' }, { status: 400 })

  try {
    await deleteAdminCertificate(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminCertificateNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Admin certificates :: delete error:', error)
    return NextResponse.json({ error: 'Failed to delete certificate' }, { status: 500 })
  }
}

function idFromPath(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/\/api\/admin\/certificates\/(\d+)$/)
  return match ? Number(match[1]) : 0
}
