import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { jsonError, requestId } from '@/lib/http-response'
import { putR2Object } from '@/lib/r2'
import { createUploadAttachmentToken } from '@/lib/upload-attachment'
import { objectKeyForUpload } from '@/lib/upload-key'
import { UploadValidationError, validateUploadBytes } from '@/lib/upload-validation'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  const id = requestId()

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return jsonError('Image file is required', 400, id)
    }

    const body = Buffer.from(await file.arrayBuffer())
    const validated = validateUploadBytes(body, file.type, file.name)
    const certificateNo = typeof formData.get('certificateNo') === 'string'
      ? String(formData.get('certificateNo'))
      : ''
    const objectKey = objectKeyForUpload(file, certificateNo, validated.extension)
    const response = await putR2Object({ objectKey, body, contentType: validated.contentType })

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      console.error('Admin upload :: R2 upstream error:', {
        requestId: id,
        status: response.status,
      })
      return jsonError('Image upload is temporarily unavailable', 502, id)
    }

    return NextResponse.json(
      {
        objectKey,
        attachmentToken: createUploadAttachmentToken(objectKey),
        originalName: file.name || objectKey,
      },
      { headers: { 'X-Request-ID': id } }
    )
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return jsonError(error.message, 400, id)
    }
    console.error('Admin upload :: R2 error:', {
      requestId: id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return jsonError('Image upload is temporarily unavailable', 503, id)
  }
}
