import { createHash, randomUUID } from 'node:crypto'
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { getMysqlPool } from '@/lib/mysql'
import { verifyUploadAttachmentToken } from '@/lib/upload-attachment'

const INTERNAL_COLUMNS = new Set([
  'id',
  'appwrite_document_id',
  'r2_object_key',
  'appwrite_created_at',
  'appwrite_updated_at',
  'created_at',
  'updated_at',
])

const SERVER_CONTROL_FIELDS = new Set(['__uploadedImage', '__removeImage', '__expectedRevision'])
const IMMUTABLE_INPUT_FIELDS = new Set([...INTERNAL_COLUMNS, 'r2_object_key'])
const ALWAYS_HIDDEN_FIELDS = new Set(['r2_object_key'])
const MAX_TEXT_LENGTH = 2000
const DEFAULT_LIST_PAGE_SIZE = 50
const MAX_LIST_PAGE_SIZE = 100

export class AdminCertificateInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminCertificateInputError'
  }
}

export class AdminCertificateNotFoundError extends Error {
  constructor(message = 'Certificate not found') {
    super(message)
    this.name = 'AdminCertificateNotFoundError'
  }
}

export class AdminCertificateConflictError extends Error {
  constructor(message = 'Certificate number already exists') {
    super(message)
    this.name = 'AdminCertificateConflictError'
  }
}

export class AdminCertificateRevisionConflictError extends Error {
  constructor(message = 'Certificate was changed by another edit') {
    super(message)
    this.name = 'AdminCertificateRevisionConflictError'
  }
}

export type AdminAttribute = {
  key: string
  type: string
  size: number
  required: boolean
  status: string
  $id: string
}

export type AdminCertificateListOptions = {
  page?: number
  pageSize?: number
  search?: string
}

type ColumnInfo = {
  name: string
  type: string
  nullable: boolean
}

type UploadPayload = {
  objectKey: string
  attachmentToken: string
  originalName?: string
  thumbnailDataUrl?: string
}

type CertificateRow = RowDataPacket & {
  id: number
  CERTIFICATE_NO: string | null
  r2_object_key: string | null
  updated_at?: Date | string | null
  has_thumbnail?: number
}

export async function listAdminCertificates(options: AdminCertificateListOptions = {}) {
  const page = Math.max(1, Math.floor(options.page || 1))
  const pageSize = Math.min(
    MAX_LIST_PAGE_SIZE,
    Math.max(1, Math.floor(options.pageSize || DEFAULT_LIST_PAGE_SIZE))
  )
  const search = options.search?.trim() || ''
  const offset = (page - 1) * pageSize
  const whereClause = search ? searchableWhereClause() : ''
  const searchParams: Record<string, string> = {}
  if (search) searchParams.search = `%${escapeLike(search)}%`
  const listParams: Record<string, string | number> = { ...searchParams, limit: pageSize, offset }

  const [rows] = await getMysqlPool().execute<CertificateRow[]>(
    [
      'SELECT `certificates`.*,',
      'CASE WHEN `certificate_thumbnails`.`certificate_id` IS NULL THEN 0 ELSE 1 END AS `has_thumbnail`',
      'FROM `certificates`',
      'LEFT JOIN `certificate_thumbnails` ON `certificate_thumbnails`.`certificate_id` = `certificates`.`id`',
      whereClause,
      'ORDER BY `certificates`.`created_at` DESC, `certificates`.`id` DESC',
      'LIMIT :limit OFFSET :offset',
    ].filter(Boolean).join(' '),
    listParams
  )

  const [countRows] = await getMysqlPool().execute<(RowDataPacket & { total: number })[]>(
    [
      'SELECT COUNT(*) AS `total`',
      'FROM `certificates`',
      whereClause,
    ].filter(Boolean).join(' '),
    searchParams
  )

  return {
    documents: rows.map(toAdminDocument),
    page,
    pageSize,
    total: Number(countRows[0]?.total || 0),
  }
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
  assertPlainInput(input)
  const connection = await getMysqlPool().getConnection()
  await connection.beginTransaction()

  try {
    const columns = await editableColumnNames(connection)
    const data = pickEditableData(input, columns)
    const upload = parseUploadPayload(input.__uploadedImage)

    if (upload) {
      data.r2_object_key = upload.objectKey
      data.Certificate_photograph = upload.originalName || upload.objectKey
    }

    validateCertificateNumber(data.CERTIFICATE_NO, true)
    await assertCertificateNumberAvailable(connection, data.CERTIFICATE_NO)
    data.appwrite_document_id = `admin-${randomUUID()}`

    const keys = Object.keys(data)
    const placeholders = keys.map((key) => `:${key}`)

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO \`certificates\` (${keys.map(qid).join(', ')}) VALUES (${placeholders.join(', ')})`,
      data
    )

    if (upload?.thumbnailDataUrl) {
      await upsertThumbnail(connection, result.insertId, upload.thumbnailDataUrl)
    }

    const document = await getAdminCertificateById(result.insertId, connection)
    await connection.commit()
    return document
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function updateAdminCertificate(id: number, input: Record<string, unknown>) {
  assertPlainInput(input)
  const connection = await getMysqlPool().getConnection()
  await connection.beginTransaction()

  try {
    const columns = await editableColumnNames(connection)
    const data = pickEditableData(input, columns)
    const upload = parseUploadPayload(input.__uploadedImage)
    const removeImage = input.__removeImage === true
    const expectedRevision = parseExpectedRevision(input.__expectedRevision)

    if (upload) {
      data.r2_object_key = upload.objectKey
      data.Certificate_photograph = upload.originalName || upload.objectKey
    } else if (removeImage) {
      data.r2_object_key = null
      data.Certificate_photograph = null
    }

    if (Object.prototype.hasOwnProperty.call(data, 'CERTIFICATE_NO')) {
      validateCertificateNumber(data.CERTIFICATE_NO, false)
      await assertCertificateNumberAvailable(connection, data.CERTIFICATE_NO, id)
    }

    const keys = Object.keys(data)
    if (keys.length > 0) {
      const setClause = keys.map((key) => `${qid(key)} = :${key}`).join(', ')
      const whereClause = expectedRevision
        ? 'WHERE `id` = :id AND `updated_at` = :expectedRevision'
        : 'WHERE `id` = :id'
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE \`certificates\` SET ${setClause} ${whereClause}`,
        { ...data, id, expectedRevision }
      )
      if (result.affectedRows === 0) {
        await assertUpdateTargetStillCurrent(connection, id, expectedRevision)
      }
    }

    if (upload?.thumbnailDataUrl) {
      await upsertThumbnail(connection, id, upload.thumbnailDataUrl)
    } else if (removeImage) {
      await connection.execute('DELETE FROM `certificate_thumbnails` WHERE `certificate_id` = :id', { id })
    }

    const document = await getAdminCertificateById(id, connection)
    if (!document) throw new AdminCertificateNotFoundError()
    await connection.commit()
    return document
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function deleteAdminCertificate(id: number) {
  const [result] = await getMysqlPool().execute<ResultSetHeader>('DELETE FROM `certificates` WHERE `id` = :id', { id })
  if (result.affectedRows === 0) throw new AdminCertificateNotFoundError()
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

async function getAdminCertificateById(
  id: number,
  connection: Pick<PoolConnection, 'execute'> = getMysqlPool()
) {
  const [rows] = await connection.execute<CertificateRow[]>(
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

async function editableColumnNames(connection?: Pick<PoolConnection, 'query'>) {
  const columns = await getCertificateColumns(connection)
  const names = columns
    .map((column) => column.name)
    .filter((name) => !INTERNAL_COLUMNS.has(name))

  return new Set(names)
}

async function getCertificateColumns(connection: Pick<PoolConnection, 'query'> = getMysqlPool()): Promise<ColumnInfo[]> {
  const [rows] = await connection.query<(RowDataPacket & { Field: string; Type: string; Null: string })[]>(
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
    if (SERVER_CONTROL_FIELDS.has(key)) continue
    if (IMMUTABLE_INPUT_FIELDS.has(key)) {
      throw new AdminCertificateInputError(`${key} cannot be written by clients`)
    }
    if (!allowedColumns.has(key)) {
      throw new AdminCertificateInputError(`Unknown certificate field: ${key}`)
    }
    data[key] = normalizeValue(value)
  }

  return data
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new AdminCertificateInputError('Certificate field values must be strings, numbers, booleans or null')
  }
  const normalized = typeof value === 'string' ? value.trim() : String(value)
  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new AdminCertificateInputError('Certificate field value is too long')
  }
  return normalized === '' ? null : normalized
}

function validateCertificateNumber(value: string | null | undefined, create: boolean) {
  if (!value) {
    throw new AdminCertificateInputError(
      create ? 'CERTIFICATE_NO is required' : 'CERTIFICATE_NO cannot be blank'
    )
  }
  if (value.length > 64) {
    throw new AdminCertificateInputError('CERTIFICATE_NO is too long')
  }
}

async function assertCertificateNumberAvailable(
  connection: Pick<PoolConnection, 'execute'>,
  certificateNo: string | null | undefined,
  excludeId?: number
) {
  if (!certificateNo) return
  const params: Record<string, string | number> = { certificateNo }
  if (excludeId !== undefined) {
    params.excludeId = excludeId
  }
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(
    [
      'SELECT `id` FROM `certificates`',
      'WHERE `CERTIFICATE_NO` = :certificateNo',
      excludeId ? 'AND `id` <> :excludeId' : '',
      'LIMIT 1',
    ].filter(Boolean).join(' '),
    params
  )
  if (rows.length > 0) {
    throw new AdminCertificateConflictError()
  }
}

function toAdminDocument(row: CertificateRow) {
  const doc: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    if (key === 'has_thumbnail') continue
    if (ALWAYS_HIDDEN_FIELDS.has(key)) continue
    doc[key] = value instanceof Date ? value.toISOString() : value
  }

  doc.$id = String(row.id)
  const version = versionForRow(row)
  doc.$revision = version
  doc.$thumbnailUrl = row.has_thumbnail
    ? `/api/admin/certificates/${row.id}/thumbnail${version ? `?v=${encodeURIComponent(version)}` : ''}`
    : ''
  doc.$imageUrl =
    row.r2_object_key && row.CERTIFICATE_NO
      ? `/api/certificates/${encodeURIComponent(row.CERTIFICATE_NO)}/image${version ? `?v=${encodeURIComponent(version)}` : ''}`
      : ''

  return doc
}

function parseUploadPayload(value: unknown): UploadPayload | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    throw new AdminCertificateInputError('Uploaded image payload is invalid')
  }
  const payload = value as Record<string, unknown>
  if (typeof payload.objectKey !== 'string' || !payload.objectKey) {
    throw new AdminCertificateInputError('Uploaded image object key is required')
  }
  if (!payload.objectKey.startsWith('certificates/') || payload.objectKey.includes('..')) {
    throw new AdminCertificateInputError('Uploaded image object key is invalid')
  }
  if (
    typeof payload.attachmentToken !== 'string' ||
    !verifyUploadAttachmentToken(payload.objectKey, payload.attachmentToken)
  ) {
    throw new AdminCertificateInputError('Uploaded image attachment token is invalid')
  }
  if (
    payload.originalName !== undefined &&
    (typeof payload.originalName !== 'string' || payload.originalName.length > 255)
  ) {
    throw new AdminCertificateInputError('Uploaded image original name is invalid')
  }
  if (
    payload.thumbnailDataUrl !== undefined &&
    typeof payload.thumbnailDataUrl !== 'string'
  ) {
    throw new AdminCertificateInputError('Uploaded image thumbnail is invalid')
  }

  return {
    objectKey: payload.objectKey,
    attachmentToken: payload.attachmentToken,
    originalName: typeof payload.originalName === 'string' ? payload.originalName : undefined,
    thumbnailDataUrl: typeof payload.thumbnailDataUrl === 'string' ? payload.thumbnailDataUrl : undefined,
  }
}

function parseExpectedRevision(value: unknown) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') {
    throw new AdminCertificateInputError('__expectedRevision must be a string')
  }
  return value
}

async function assertUpdateTargetStillCurrent(
  connection: Pick<PoolConnection, 'execute'>,
  id: number,
  expectedRevision: string
) {
  const [rows] = await connection.execute<(RowDataPacket & { updated_at: Date | string | null })[]>(
    'SELECT `updated_at` FROM `certificates` WHERE `id` = :id LIMIT 1',
    { id }
  )
  if (rows.length === 0) throw new AdminCertificateNotFoundError()
  if (expectedRevision) throw new AdminCertificateRevisionConflictError()
  throw new AdminCertificateNotFoundError()
}

async function upsertThumbnail(connection: Pick<PoolConnection, 'execute'>, certificateId: number, dataUrl: string) {
  const thumbnail = parseThumbnailDataUrl(dataUrl)
  if (!thumbnail) return

  await connection.execute(
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

function assertPlainInput(input: Record<string, unknown>) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AdminCertificateInputError('Certificate payload must be an object')
  }
  if (
    '__removeImage' in input &&
    input.__removeImage !== undefined &&
    typeof input.__removeImage !== 'boolean'
  ) {
    throw new AdminCertificateInputError('__removeImage must be a boolean')
  }
}

function versionForRow(row: CertificateRow) {
  const value = row.updated_at
  if (!value) return ''
  if (value instanceof Date) return formatMysqlDateTime(value)
  return String(value)
}

function formatMysqlDateTime(value: Date) {
  return value.toISOString().slice(0, 23).replace('T', ' ')
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

function searchableWhereClause() {
  return [
    'WHERE (',
    '`certificates`.`CERTIFICATE_NO` LIKE :search ESCAPE \'\\\\\'',
    'OR `certificates`.`PRODUCT_NAME` LIKE :search ESCAPE \'\\\\\'',
    'OR `certificates`.`CATEGORY` LIKE :search ESCAPE \'\\\\\'',
    ')',
  ].join(' ')
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}
