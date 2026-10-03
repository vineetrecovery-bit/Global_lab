import { NextRequest } from 'next/server'
import { clearAdminSessionResponse } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return clearAdminSessionResponse(request)
}
