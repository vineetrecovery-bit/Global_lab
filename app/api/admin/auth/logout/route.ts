import { clearAdminSessionResponse } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function POST() {
  return clearAdminSessionResponse()
}
