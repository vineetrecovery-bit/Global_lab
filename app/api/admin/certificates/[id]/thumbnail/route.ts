import { NextRequest, NextResponse } from 'next/server'
import { getThumbnail } from '@/lib/admin-certificates'
import { requireAdmin } from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  const match = request.nextUrl.pathname.match(/\/api\/admin\/certificates\/(\d+)\/thumbnail$/)
  const id = match ? Number(match[1]) : 0
  if (!id) return NextResponse.json({ error: 'Invalid certificate id' }, { status: 400 })

  try {
    const thumbnail = await getThumbnail(id)
    if (!thumbnail) return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 })

    return new NextResponse(thumbnail.thumbnail_blob, {
      headers: {
        'Content-Type': thumbnail.thumbnail_mime,
        'Content-Length': String(thumbnail.thumbnail_size_bytes),
        'Cache-Control': request.nextUrl.searchParams.has('v')
          ? 'private, max-age=3600'
          : 'no-store',
      },
    })
  } catch (error) {
    console.error('Admin certificates :: thumbnail error:', error)
    return NextResponse.json({ error: 'Failed to load thumbnail' }, { status: 500 })
  }
}
