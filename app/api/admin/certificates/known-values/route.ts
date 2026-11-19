import { NextRequest } from 'next/server'
import { getAdminKnownValues } from '@/lib/admin-certificates'
import { requireAdmin } from '@/lib/admin-auth'
import { jsonError, jsonOk, requestId } from '@/lib/http-response'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  const id = requestId()
  try {
    return jsonOk({ values: await getAdminKnownValues() }, id)
  } catch (error) {
    console.error('Admin certificates :: known values error:', error)
    return jsonError('Failed to load existing values', 500, id)
  }
}
