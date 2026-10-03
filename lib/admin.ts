type UploadedImage = {
  objectKey: string
  attachmentToken: string
  originalName: string
  thumbnailDataUrl?: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: init?.body instanceof FormData
      ? init.headers
      : {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with ${response.status}`)
  }

  return data
}

// ---- Auth ----
export async function adminLogin(email: string, password: string) {
  const { user } = await api<{ user: { email: string } }>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return user
}

export async function adminLogout() {
  return api<{ ok: boolean }>('/api/admin/auth/logout', { method: 'POST' })
}

export async function getAdminUser() {
  const { user } = await api<{ user: { email: string } | null }>('/api/admin/auth/me')
  return user
}

// ---- Documents (Rows) ----
export async function getAllDocuments() {
  const { documents } = await getDocumentsPage()
  return documents
}

export async function getDocumentsPage({
  page = 1,
  pageSize = 50,
  search = '',
}: {
  page?: number
  pageSize?: number
  search?: string
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (search.trim()) params.set('search', search.trim())
  return api<{ documents: any[]; page: number; pageSize: number; total: number }>(
    `/api/admin/certificates?${params.toString()}`
  )
}

export async function createDocument(data: Record<string, unknown>) {
  const { document } = await api<{ document: any }>('/api/admin/certificates', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return document
}

export async function updateDocument(docId: string, data: Record<string, unknown>) {
  const { document } = await api<{ document: any }>(`/api/admin/certificates/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return document
}

export async function deleteDocument(docId: string) {
  return api<{ ok: boolean }>(`/api/admin/certificates/${encodeURIComponent(docId)}`, {
    method: 'DELETE',
  })
}

// ---- Attributes (Columns) ----
export async function getAttributes() {
  const { attributes } = await api<{ attributes: any[] }>('/api/admin/certificates/attributes')
  return attributes
}

// ---- Storage ----
export async function uploadImage(file: File, certificateNo?: string): Promise<UploadedImage> {
  const formData = new FormData()
  formData.append('file', file)
  if (certificateNo) formData.append('certificateNo', certificateNo)

  return api<UploadedImage>('/api/admin/upload', {
    method: 'POST',
    body: formData,
  })
}

export function getImageUrl(document: { $imageUrl?: string; Certificate_photograph?: string } | string): string {
  if (typeof document === 'string') return document.startsWith('/api/') ? document : ''
  return document.$imageUrl || ''
}
