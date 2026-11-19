import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/admin/certificates/known-values/route'
import { getMysqlPool } from '@/lib/mysql'

vi.mock('@/lib/mysql', () => ({
  getMysqlPool: vi.fn(),
}))

describe('admin known-values route', () => {
  it('rejects requests without an admin session before touching the database', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/certificates/known-values'))

    expect(response.status).toBe(401)
    expect(getMysqlPool).not.toHaveBeenCalled()
  })
})
