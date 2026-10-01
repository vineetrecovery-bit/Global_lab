import { NextRequest, NextResponse } from 'next/server'
import { getAdminAttributes } from '@/lib/admin-certificates'
import { requireAdmin } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  try {
    return NextResponse.json({ attributes: await getAdminAttributes() })
  } catch (error) {
    console.error('Admin certificates :: attributes error:', error)
    return NextResponse.json({ error: 'Failed to load columns' }, { status: 500 })
  }
}
