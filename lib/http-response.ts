import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'

export function requestId() {
  return randomUUID()
}

export function jsonError(error: string, status: number, id = requestId()) {
  return NextResponse.json(
    { error, requestId: id },
    {
      status,
      headers: {
        'X-Request-ID': id,
        'Cache-Control': 'no-store',
      },
    }
  )
}

export function jsonOk<T>(body: T, id = requestId()) {
  return NextResponse.json(body, {
    headers: {
      'X-Request-ID': id,
      'Cache-Control': 'no-store',
    },
  })
}
