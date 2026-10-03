import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMysqlPool } from '@/lib/mysql'
import {
  AdminCertificateInputError,
  AdminCertificateNotFoundError,
  AdminCertificateRevisionConflictError,
  createAdminCertificate,
  listAdminCertificates,
  updateAdminCertificate,
} from '@/lib/admin-certificates'
import { createUploadAttachmentToken } from '@/lib/upload-attachment'
import { syntheticThumbnailDataUrl } from '@/tests/fixtures/certificates'

vi.mock('@/lib/mysql', () => ({
  getMysqlPool: vi.fn(),
}))

describe('certificate save boundary', () => {
  beforeEach(() => {
    vi.mocked(getMysqlPool).mockReset()
    process.env.SESSION_SECRET = 'synthetic-test-secret-not-used-outside-tests'
  })

  it('does not attempt a thumbnail write when the certificate insert fails', async () => {
    const connection = mockConnection()
    const execute = vi.fn(async (statement: unknown) => {
      const sql = String(statement)
      if (sql.startsWith('SELECT `id` FROM `certificates`')) return [[]]
      throw new Error('synthetic insert failure')
    })
    connection.execute = execute
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
      { Field: 'Certificate_photograph', Type: 'varchar(255)', Null: 'YES' },
    ]])
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    await expect(createAdminCertificate({ CERTIFICATE_NO: 'TEST-42' })).rejects.toThrow(
      'synthetic insert failure'
    )
    expect(execute).toHaveBeenCalledTimes(2)
    expect(connection.rollback).toHaveBeenCalledTimes(1)
    expect(connection.commit).not.toHaveBeenCalled()
  })

  it('rolls back the certificate insert when the thumbnail write fails', async () => {
    const connection = mockConnection()
    const execute = vi.fn(async (statement: unknown) => {
      const sql = String(statement)
      if (sql.startsWith('SELECT `id` FROM `certificates`')) {
        return [[]]
      }
      if (sql.startsWith('INSERT INTO `certificates`')) {
        return [{ insertId: 42 }]
      }
      if (sql.startsWith('INSERT INTO `certificate_thumbnails`')) {
        throw new Error('synthetic thumbnail failure')
      }
      return [[]]
    })
    connection.execute = execute
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
      { Field: 'Certificate_photograph', Type: 'varchar(255)', Null: 'YES' },
    ]])
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    await expect(createAdminCertificate({
      CERTIFICATE_NO: 'TEST-42',
      __uploadedImage: {
        objectKey: 'certificates/synthetic.jpg',
        attachmentToken: createUploadAttachmentToken('certificates/synthetic.jpg'),
        thumbnailDataUrl: syntheticThumbnailDataUrl,
      },
    })).rejects.toThrow('synthetic thumbnail failure')

    expect(connection.rollback).toHaveBeenCalledTimes(1)
    expect(connection.commit).not.toHaveBeenCalled()
  })

  it('rejects immutable system fields before writing', async () => {
    const connection = mockConnection()
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
    ]])
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    await expect(createAdminCertificate({
      CERTIFICATE_NO: 'TEST-42',
      appwrite_document_id: 'forged',
    })).rejects.toThrow(AdminCertificateInputError)

    expect(connection.execute).not.toHaveBeenCalled()
    expect(connection.rollback).toHaveBeenCalledTimes(1)
  })

  it('rejects object-valued certificate fields before writing', async () => {
    const connection = mockConnection()
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
      { Field: 'PRODUCT_NAME', Type: 'varchar(255)', Null: 'YES' },
    ]])
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    await expect(createAdminCertificate({
      CERTIFICATE_NO: 'TEST-42',
      PRODUCT_NAME: { nested: true },
    })).rejects.toThrow(AdminCertificateInputError)

    expect(connection.execute).not.toHaveBeenCalled()
    expect(connection.rollback).toHaveBeenCalledTimes(1)
  })

  it('rejects a missing certificate number before create', async () => {
    const connection = mockConnection()
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
    ]])
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    await expect(createAdminCertificate({ CERTIFICATE_NO: '   ' })).rejects.toThrow(
      'CERTIFICATE_NO is required'
    )

    expect(connection.execute).not.toHaveBeenCalled()
    expect(connection.rollback).toHaveBeenCalledTimes(1)
  })

  it('reports a missing update target without writing thumbnails', async () => {
    const connection = mockConnection()
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
    ]])
    connection.execute = vi.fn(async (statement: unknown) => {
      if (String(statement).startsWith('UPDATE `certificates`')) {
        return [{ affectedRows: 0 }]
      }
      return [[]]
    })
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    await expect(updateAdminCertificate(999, { CERTIFICATE_NO: 'TEST-42' })).rejects.toThrow(
      AdminCertificateNotFoundError
    )

    expect(connection.rollback).toHaveBeenCalledTimes(1)
    expect(connection.commit).not.toHaveBeenCalled()
  })

  it('reports a stale expected revision without overwriting', async () => {
    const connection = mockConnection()
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
    ]])
    connection.execute = vi.fn(async (statement: unknown) => {
      const sql = String(statement)
      if (sql.startsWith('SELECT `id` FROM `certificates`')) return [[]]
      if (sql.startsWith('UPDATE `certificates`')) return [{ affectedRows: 0 }]
      if (sql.startsWith('SELECT `updated_at` FROM `certificates`')) {
        return [[{ updated_at: '2026-10-02 12:00:00.000' }]]
      }
      return [[]]
    })
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    await expect(updateAdminCertificate(42, {
      CERTIFICATE_NO: 'TEST-42',
      __expectedRevision: '2026-10-02 11:00:00.000',
    })).rejects.toThrow(AdminCertificateRevisionConflictError)

    expect(connection.rollback).toHaveBeenCalledTimes(1)
    expect(connection.commit).not.toHaveBeenCalled()
  })

  it('rejects forged upload object keys without a matching attachment token', async () => {
    const connection = mockConnection()
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
      { Field: 'Certificate_photograph', Type: 'varchar(255)', Null: 'YES' },
    ]])
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    await expect(createAdminCertificate({
      CERTIFICATE_NO: 'TEST-42',
      __uploadedImage: {
        objectKey: 'certificates/forged.jpg',
        attachmentToken: createUploadAttachmentToken('certificates/other.jpg'),
      },
    })).rejects.toThrow('Uploaded image attachment token is invalid')

    expect(connection.execute).not.toHaveBeenCalled()
    expect(connection.rollback).toHaveBeenCalledTimes(1)
  })

  it('reports duplicate certificate numbers as conflicts', async () => {
    const connection = mockConnection()
    connection.query = vi.fn().mockResolvedValue([[
      { Field: 'CERTIFICATE_NO', Type: 'varchar(255)', Null: 'NO' },
    ]])
    connection.execute = vi.fn(async (statement: unknown) => {
      if (String(statement).startsWith('SELECT `id` FROM `certificates`')) {
        return [[{ id: 7 }]]
      }
      return [[]]
    })
    vi.mocked(getMysqlPool).mockReturnValue({ getConnection: vi.fn().mockResolvedValue(connection) } as never)

    await expect(createAdminCertificate({ CERTIFICATE_NO: 'TEST-42' })).rejects.toThrow(
      'Certificate number already exists'
    )

    expect(connection.rollback).toHaveBeenCalledTimes(1)
    expect(connection.commit).not.toHaveBeenCalled()
  })

  it('lists certificates with server pagination and search totals', async () => {
    const execute = vi.fn(async (statement: unknown, params: unknown) => {
      const sql = String(statement)
      if (sql.startsWith('SELECT `certificates`.*')) {
        expect(sql).toContain('ORDER BY `certificates`.`created_at` DESC, `certificates`.`id` DESC')
        expect(sql).toContain('LIMIT :limit OFFSET :offset')
        expect(params).toMatchObject({ limit: 25, offset: 25, search: '%TEST\\_%' })
        return [[{
          id: 42,
          CERTIFICATE_NO: 'TEST_42',
          r2_object_key: null,
          updated_at: '2026-10-02 12:00:00.000',
        }]]
      }
      if (sql.startsWith('SELECT COUNT(*) AS `total`')) {
        expect(sql).toContain('LIKE :search')
        return [[{ total: 51 }]]
      }
      return [[]]
    })
    vi.mocked(getMysqlPool).mockReturnValue({ execute } as never)

    await expect(listAdminCertificates({ page: 2, pageSize: 25, search: 'TEST_' })).resolves.toMatchObject({
      documents: [{ CERTIFICATE_NO: 'TEST_42' }],
      page: 2,
      pageSize: 25,
      total: 51,
    })
  })
})

function mockConnection() {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn().mockResolvedValue([[]]),
    query: vi.fn().mockResolvedValue([[]]),
  }
}
