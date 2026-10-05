import { afterEach, describe, expect, it, vi } from 'vitest'
import { runtimeLog } from '@/lib/runtime-log'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runtimeLog', () => {
  it('writes one structured JSON line to stdout', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    runtimeLog('certificate.verify', {
      requestId: 'synthetic-request',
      outcome: 'verified',
      durationMs: 12,
    })

    expect(output).toHaveBeenCalledOnce()
    expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({
      level: 'info',
      event: 'certificate.verify',
      requestId: 'synthetic-request',
      outcome: 'verified',
      durationMs: 12,
    })
  })
})
