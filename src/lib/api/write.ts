import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonError } from './respond'
import { claimIdempotency, storeIdempotentResult, requestHash } from './idempotency'

export type WriteOutcome = { status: number; body: unknown }

/**
 * Body-parsing + Idempotency-Key handling shared by POST routes: parse JSON,
 * (if an Idempotency-Key is present) replay a prior response or reject a reused
 * key, run the write, then persist the response for replay.
 */
export async function withIdempotentWrite(
  req: Request,
  boxId: string,
  service: SupabaseClient,
  run: (body: unknown) => Promise<WriteOutcome>,
): Promise<Response> {
  let raw: string
  try {
    raw = await req.text()
  } catch {
    return jsonError('validation_error', 'Could not read the request body.', 400)
  }
  let parsed: unknown
  try {
    parsed = raw.trim() ? JSON.parse(raw) : {}
  } catch {
    return jsonError('validation_error', 'Request body must be valid JSON.', 400)
  }

  const key = req.headers.get('idempotency-key')?.trim() || null
  if (key) {
    const check = await claimIdempotency(service, boxId, key, requestHash('POST', new URL(req.url).pathname, raw))
    if (check.kind === 'conflict') return jsonError('conflict', 'This Idempotency-Key was used for a different request.', 409)
    if (check.kind === 'replay') return NextResponse.json(check.body as object, { status: check.status })
  }

  const out = await run(parsed)
  if (key) await storeIdempotentResult(service, boxId, key, out.status, out.body)
  return NextResponse.json(out.body as object, { status: out.status })
}
