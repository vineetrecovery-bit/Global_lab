import { NextRequest, NextResponse } from 'next/server'
import { createAdminCertificate, listAdminCertificates } from '@/lib/admin-certificates'
import { requireAdmin } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  try {
    return NextResponse.json({ documents: await listAdminCertificates() })
  } catch (error) {
    console.error('Admin certificates :: list error:', error)
    return NextResponse.json({ error: 'Failed to load certificates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  try {
    const body = await request.json()
    const document = await createAdminCertificate(body)
    return NextResponse.json({ document }, { status: 201 })
  } catch (error: any) {
    console.error('Admin certificates :: create error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to create certificate' }, { status: 500 })
  }
}
