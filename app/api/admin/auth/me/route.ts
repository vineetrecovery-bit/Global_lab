import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = getAdminSession(request)
  return NextResponse.json({ user: session ? { email: session.email } : null })
}
