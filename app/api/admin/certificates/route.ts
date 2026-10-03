import { NextRequest, NextResponse } from 'next/server'
import {
  AdminCertificateConflictError,
  AdminCertificateInputError,
  createAdminCertificate,
  listAdminCertificates,
} from '@/lib/admin-certificates'
import { requireAdmin } from '@/lib/admin-auth'
import { jsonError, requestId } from '@/lib/http-response'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  try {
    const page = Number(request.nextUrl.searchParams.get('page') || 1)
    const pageSize = Number(request.nextUrl.searchParams.get('pageSize') || 50)
    const search = request.nextUrl.searchParams.get('search') || ''
    return NextResponse.json(await listAdminCertificates({ page, pageSize, search }))
  } catch (error) {
    console.error('Admin certificates :: list error:', error)
    return NextResponse.json({ error: 'Failed to load certificates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  const id = requestId()

  try {
    const body = await request.json()
    const document = await createAdminCertificate(body)
    return NextResponse.json({ document }, { status: 201 })
  } catch (error) {
    if (error instanceof AdminCertificateInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof AdminCertificateConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('Admin certificates :: create error:', {
      requestId: id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return jsonError('Failed to create certificate', 500, id)
  }
}
