import { createHash, randomUUID } from 'node:crypto'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { getMysqlPool } from '@/lib/mysql'

const INTERNAL_COLUMNS = new Set([
  'id',
  'appwrite_document_id',
  'r2_object_key',
  'appwrite_created_at',
  'appwrite_updated_at',
  'created_at',
  'updated_at',
])

const ALWAYS_HIDDEN_FIELDS = new Set(['r2_object_key'])

export type AdminAttribute = {
  key: string
  type: string
  size: number
  required: boolean
  status: string
  $id: string
}

type ColumnInfo = {
  name: string
  type: string
  nullable: boolean
}

type UploadPayload = {
  objectKey: string
  originalName?: string
  thumbnailDataUrl?: string
}

type CertificateRow = RowDataPacket & {
  id: number
  CERTIFICATE_NO: string | null
  r2_object_key: string | null
  has_thumbnail?: number
}

export async function listAdminCertificates() {
  const [rows] = await getMysqlPool().execute<CertificateRow[]>(
    [
      'SELECT `certificates`.*,',
      'CASE WHEN `certificate_thumbnails`.`certificate_id` IS NULL THEN 0 ELSE 1 END AS `has_thumbnail`',
      'FROM `certificates`',
      'LEFT JOIN `certificate_thumbnails` ON `certificate_thumbnails`.`certificate_id` = `certificates`.`id`',
      'ORDER BY `certificates`.`created_at` DESC',
      'LIMIT 500',
    ].join(' ')
  )

  return rows.map(toAdminDocument)
}

export async function getAdminAttributes(): Promise<AdminAttribute[]> {
  const columns = await getCertificateColumns()
  return columns
    .filter((column) => !INTERNAL_COLUMNS.has(column.name))
    .map((column) => ({
      key: column.name,
      type: mysqlTypeName(column.type),
      size: mysqlTypeSize(column.type),
      required: !column.nullable,
      status: 'available',
      $id: column.name,
    }))
}

export async function createAdminCertificate(input: Record<string, unknown>) {
  const columns = await editableColumnNames()
  const data = pickEditableData(input, columns)
  const upload = parseUploadPayload(input.__uploadedImage)

  if (upload) {
    data.r2_object_key = upload.objectKey
    data.Certificate_photograph = upload.originalName || upload.objectKey
  }

  data.appwrite_document_id = `admin-${randomUUID()}`

  const keys = Object.keys(data)
  const placeholders = keys.map((key) => `:${key}`)

  const [result] = await getMysqlPool().execute<ResultSetHeader>(
    `INSERT INTO \`certificates\` (${keys.map(qid).join(', ')}) VALUES (${placeholders.join(', ')})`,
    data
  )

  if (upload?.thumbnailDataUrl) {
    await upsertThumbnail(result.insertId, upload.thumbnailDataUrl)
  }

  return getAdminCertificateById(result.insertId)
}

export async function updateAdminCertificate(id: number, input: Record<string, unknown>) {
  const columns = await editableColumnNames()
  const data = pickEditableData(input, columns)
  const upload = parseUploadPayload(input.__uploadedImage)
  const removeImage = input.__removeImage === true

  if (upload) {
    data.r2_object_key = upload.objectKey
    data.Certificate_photograph = upload.originalName || upload.objectKey
  } else if (removeImage) {
    data.r2_object_key = null
    data.Certificate_photograph = null
  }

  const keys = Object.keys(data)
  if (keys.length > 0) {
    const setClause = keys.map((key) => `${qid(key)} = :${key}`).join(', ')
    await getMysqlPool().execute<ResultSetHeader>(
      `UPDATE \`certificates\` SET ${setClause} WHERE \`id\` = :id`,
      { ...data, id }
    )
  }

  if (upload?.thumbnailDataUrl) {
    await upsertThumbnail(id, upload.thumbnailDataUrl)
  } else if (removeImage) {
    await getMysqlPool().execute('DELETE FROM `certificate_thumbnails` WHERE `certificate_id` = :id', { id })
  }

  return getAdminCertificateById(id)
}

export async function deleteAdminCertificate(id: number) {
  await getMysqlPool().execute<ResultSetHeader>('DELETE FROM `certificates` WHERE `id` = :id', { id })
}

export async function getThumbnail(id: number) {
  const [rows] = await getMysqlPool().execute<
    (RowDataPacket & {
      thumbnail_blob: Buffer
      thumbnail_mime: string
      thumbnail_size_bytes: number
    })[]
  >(
    'SELECT `thumbnail_blob`, `thumbnail_mime`, `thumbnail_size_bytes` FROM `certificate_thumbnails` WHERE `certificate_id` = :id LIMIT 1',
    { id }
  )

  return rows[0] || null
}

async function getAdminCertificateById(id: number) {
  const [rows] = await getMysqlPool().execute<CertificateRow[]>(
    [
      'SELECT `certificates`.*,',
      'CASE WHEN `certificate_thumbnails`.`certificate_id` IS NULL THEN 0 ELSE 1 END AS `has_thumbnail`',
      'FROM `certificates`',
      'LEFT JOIN `certificate_thumbnails` ON `certificate_thumbnails`.`certificate_id` = `certificates`.`id`',
      'WHERE `certificates`.`id` = :id',
      'LIMIT 1',
    ].join(' '),
    { id }
  )

  return rows[0] ? toAdminDocument(rows[0]) : null
}

async function editableColumnNames() {
  const columns = await getCertificateColumns()
  const names = columns
    .map((column) => column.name)
    .filter((name) => !INTERNAL_COLUMNS.has(name))

  return new Set([...names, 'r2_object_key', 'appwrite_document_id'])
}

async function getCertificateColumns(): Promise<ColumnInfo[]> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { Field: string; Type: string; Null: string })[]>(
    'SHOW COLUMNS FROM `certificates`'
  )

  return rows.map((row) => ({
    name: row.Field,
    type: row.Type,
    nullable: row.Null === 'YES',
  }))
}

function pickEditableData(input: Record<string, unknown>, allowedColumns: Set<string>) {
  const data: Record<string, string | null> = {}

  for (const [key, value] of Object.entries(input)) {
    if (!allowedColumns.has(key)) continue
    if (ALWAYS_HIDDEN_FIELDS.has(key)) continue
    data[key] = normalizeValue(value)
  }

  return data
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim()
  return String(value)
}

function toAdminDocument(row: CertificateRow) {
  const doc: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    if (key === 'has_thumbnail') continue
    if (ALWAYS_HIDDEN_FIELDS.has(key)) continue
    doc[key] = value instanceof Date ? value.toISOString() : value
  }

  doc.$id = String(row.id)
  doc.$thumbnailUrl = row.has_thumbnail ? `/api/admin/certificates/${row.id}/thumbnail` : ''
  doc.$imageUrl =
    row.r2_object_key && row.CERTIFICATE_NO
      ? `/api/certificates/${encodeURIComponent(row.CERTIFICATE_NO)}/image`
      : ''

  return doc
}

function parseUploadPayload(value: unknown): UploadPayload | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Record<string, unknown>
  if (typeof payload.objectKey !== 'string' || !payload.objectKey) return null

  return {
    objectKey: payload.objectKey,
    originalName: typeof payload.originalName === 'string' ? payload.originalName : undefined,
    thumbnailDataUrl: typeof payload.thumbnailDataUrl === 'string' ? payload.thumbnailDataUrl : undefined,
  }
}

async function upsertThumbnail(certificateId: number, dataUrl: string) {
  const thumbnail = parseThumbnailDataUrl(dataUrl)
  if (!thumbnail) return

  await getMysqlPool().execute(
    [
      'INSERT INTO `certificate_thumbnails`',
      '(`certificate_id`, `thumbnail_blob`, `thumbnail_mime`, `thumbnail_width`, `thumbnail_height`, `thumbnail_size_bytes`, `thumbnail_sha256`)',
      'VALUES (:certificateId, :blob, :mime, :width, :height, :sizeBytes, :sha256)',
      'ON DUPLICATE KEY UPDATE',
      '`thumbnail_blob` = VALUES(`thumbnail_blob`),',
      '`thumbnail_mime` = VALUES(`thumbnail_mime`),',
      '`thumbnail_width` = VALUES(`thumbnail_width`),',
      '`thumbnail_height` = VALUES(`thumbnail_height`),',
      '`thumbnail_size_bytes` = VALUES(`thumbnail_size_bytes`),',
      '`thumbnail_sha256` = VALUES(`thumbnail_sha256`)',
    ].join(' '),
    {
      certificateId,
      blob: thumbnail.buffer,
      mime: thumbnail.mime,
      width: thumbnail.width,
      height: thumbnail.height,
      sizeBytes: thumbnail.buffer.length,
      sha256: createHash('sha256').update(thumbnail.buffer).digest('hex'),
    }
  )
}

function parseThumbnailDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);width=(\d+);height=(\d+);base64,([a-z0-9+/=]+)$/i)
  if (!match) return null

  const [, mime, width, height, base64] = match
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length > 25000) return null

  return {
    buffer,
    mime,
    width: Number(width),
    height: Number(height),
  }
}

function mysqlTypeName(type: string) {
  return type.split('(')[0] || 'string'
}

function mysqlTypeSize(type: string) {
  const match = type.match(/\((\d+)/)
  return match ? Number(match[1]) : 0
}

function qid(identifier: string) {
  return `\`${identifier.replace(/`/g, '``')}\``
}
