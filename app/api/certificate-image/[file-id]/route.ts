import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.url
  const parts = url.split('/api/certificate-image/')
  const fileId = parts[parts.length - 1]?.split('?')[0]

  if (!fileId) {
    return NextResponse.json({ error: 'File ID required' }, { status: 400 })
  }

  try {
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!
    const bucketId = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID!

    const appwriteUrl = `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view`

    const res = await fetch(appwriteUrl, {
      headers: {
        'X-Appwrite-Project': projectId,
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
  }
}