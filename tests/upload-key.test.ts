import { describe, expect, it } from 'vitest'
import { objectKeyForUpload } from '@/lib/upload-key'

const jpeg = { name: 'specimen.jpeg', type: 'image/jpeg' }

describe('upload object keys', () => {
  it('keeps a readable certificate prefix and normalizes JPEG suffixes', () => {
    expect(objectKeyForUpload(jpeg, 'TEST-42')).toMatch(
      /^certificates\/TEST-42-[0-9a-f-]{36}\.jpg$/
    )
  })

  it('creates a unique key for each upload of the same certificate', () => {
    expect(objectKeyForUpload(jpeg, 'TEST-42')).not.toBe(objectKeyForUpload(jpeg, 'TEST-42'))
  })

  it('does not collapse different certificate numbers onto one key', () => {
    expect(objectKeyForUpload(jpeg, 'TEST/42')).not.toBe(objectKeyForUpload(jpeg, 'TEST-42'))
  })
})
