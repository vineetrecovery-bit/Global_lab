import { NextRequest, NextResponse } from 'next/server'
import {
  createAdminSessionResponse,
  isLoginThrottled,
  loginThrottleKey,
  recordLoginFailure,
  recordLoginSuccess,
  verifyAdminCredentials,
} from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const throttleKey = loginThrottleKey(request, email)

    if (isLoginThrottled(throttleKey)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!email || !password || !verifyAdminCredentials(email, password)) {
      recordLoginFailure(throttleKey)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    recordLoginSuccess(throttleKey)

    return createAdminSessionResponse(email.trim().toLowerCase())
  } catch (error) {
    console.error('Admin auth :: login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
