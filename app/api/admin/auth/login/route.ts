import { NextRequest, NextResponse } from 'next/server'
import { createAdminSessionResponse, verifyAdminCredentials } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password || !verifyAdminCredentials(email, password)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    return createAdminSessionResponse(email.trim().toLowerCase())
  } catch (error) {
    console.error('Admin auth :: login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
