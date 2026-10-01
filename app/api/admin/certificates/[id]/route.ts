import { NextRequest, NextResponse } from 'next/server'
import { deleteAdminCertificate, updateAdminCertificate } from '@/lib/admin-certificates'
import { requireAdmin } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  const id = idFromPath(request)
  if (!id) return NextResponse.json({ error: 'Invalid certificate id' }, { status: 400 })

  try {
    const body = await request.json()
    const document = await updateAdminCertificate(id, body)
    return NextResponse.json({ document })
  } catch (error: any) {
    console.error('Admin certificates :: update error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to update certificate' }, { status: 500 })
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
    console.error('Admin certificates :: delete error:', error)
    return NextResponse.json({ error: 'Failed to delete certificate' }, { status: 500 })
  }
}

function idFromPath(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/\/api\/admin\/certificates\/(\d+)$/)
  return match ? Number(match[1]) : 0
}
