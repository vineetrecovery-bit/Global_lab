import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { putR2Object } from '@/lib/r2'
import { createUploadAttachmentToken } from '@/lib/upload-attachment'
import { objectKeyForUpload } from '@/lib/upload-key'
import { UploadValidationError, validateUploadBytes } from '@/lib/upload-validation'

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

    const body = Buffer.from(await file.arrayBuffer())
    const validated = validateUploadBytes(body, file.type, file.name)
    const certificateNo = typeof formData.get('certificateNo') === 'string'
      ? String(formData.get('certificateNo'))
      : ''
    const objectKey = objectKeyForUpload(file, certificateNo, validated.extension)
    const response = await putR2Object({ objectKey, body, contentType: validated.contentType })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`R2 upload failed with ${response.status}: ${text.slice(0, 200)}`)
    }

    return NextResponse.json({
      objectKey,
      attachmentToken: createUploadAttachmentToken(objectKey),
      originalName: file.name || objectKey,
    })
  } catch (error: any) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Admin upload :: R2 error:', error)
    return NextResponse.json({ error: error?.message || 'Image upload failed' }, { status: 500 })
  }
}
