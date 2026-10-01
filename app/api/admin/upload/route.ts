import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { putR2Object } from '@/lib/r2'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
    }

    const certificateNo = typeof formData.get('certificateNo') === 'string'
      ? String(formData.get('certificateNo'))
      : ''
    const objectKey = objectKeyForUpload(file, certificateNo)
    const body = Buffer.from(await file.arrayBuffer())
    const contentType = file.type || 'application/octet-stream'
    const response = await putR2Object({ objectKey, body, contentType })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`R2 upload failed with ${response.status}: ${text.slice(0, 200)}`)
    }

    return NextResponse.json({
      objectKey,
      originalName: file.name || objectKey,
    })
  } catch (error: any) {
    console.error('Admin upload :: R2 error:', error)
    return NextResponse.json({ error: error?.message || 'Image upload failed' }, { status: 500 })
  }
}

function objectKeyForUpload(file: File, certificateNo: string) {
  const base = sanitizeCertificateNo(certificateNo) || randomUUID()
  const ext = extensionForFile(file)
  return `certificates/${base}${ext}`
}

function sanitizeCertificateNo(certificateNo: string) {
  return certificateNo.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')
}

function extensionForFile(file: File) {
  const nameExt = file.name.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase()
  if (nameExt && ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'].includes(nameExt)) {
    return nameExt === '.jpeg' ? '.jpg' : nameExt
  }
  if (file.type === 'image/png') return '.png'
  if (file.type === 'image/webp') return '.webp'
  if (file.type === 'image/gif') return '.gif'
  if (file.type === 'application/pdf') return '.pdf'
  return '.jpg'
}
