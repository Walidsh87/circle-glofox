import { NextResponse } from 'next/server'

// Standard public-API envelopes. Success bodies vary by endpoint; errors are
// always `{ error: { code, message } }` with a specific status — never a 200
// carrying an error, and never a raw DB message.
export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'conflict'
  | 'internal'

export function jsonOk<T>(body: T, init?: ResponseInit): Response {
  return NextResponse.json(body as object, init)
}

export function jsonError(
  code: ApiErrorCode,
  message: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  return NextResponse.json({ error: { code, message } }, { status, headers })
}
