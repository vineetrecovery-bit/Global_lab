import { NextRequest, NextResponse } from 'next/server'
import {
  createAdminSessionResponse,
  isLoginThrottled,
  loginThrottleKey,
  recordLoginFailure,
  recordLoginSuccess,
  verifyAdminCredentials,
} from '@/lib/admin-auth'
import { requestId } from '@/lib/http-response'
import { runtimeLog } from '@/lib/runtime-log'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const id = requestId()
  const startedAt = Date.now()

  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const throttleKey = loginThrottleKey(request, email)

    if (isLoginThrottled(throttleKey)) {
      runtimeLog('auth.login', {
        requestId: id,
        outcome: 'throttled',
        durationMs: Date.now() - startedAt,
      }, 'warn')
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401, headers: { 'X-Request-ID': id } }
      )
    }

    if (!email || !password || !verifyAdminCredentials(email, password)) {
      recordLoginFailure(throttleKey)
      runtimeLog('auth.login', {
        requestId: id,
        outcome: 'rejected',
        durationMs: Date.now() - startedAt,
      }, 'warn')
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401, headers: { 'X-Request-ID': id } }
      )
    }

    recordLoginSuccess(throttleKey)

    const response = createAdminSessionResponse(email.trim().toLowerCase())
    response.headers.set('X-Request-ID', id)
    runtimeLog('auth.login', {
      requestId: id,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
    })
    return response
  } catch (error) {
    runtimeLog('auth.login', {
      requestId: id,
      outcome: 'service_error',
      errorType: error instanceof Error ? error.name : 'UnknownError',
      durationMs: Date.now() - startedAt,
    }, 'error')
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500, headers: { 'X-Request-ID': id } }
    )
  }
}
