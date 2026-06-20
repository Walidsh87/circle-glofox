import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// Idempotency-Key support for public-API writes (#65 Phase 2). Pattern mirrors
// the Stripe-webhook claimEvent dedup: insert the (box, key) slot first; a
// unique-violation means it was seen — replay the stored response if the request
// is identical, else 409 (key reused for a different request).

export function requestHash(method: string, path: string, body: string): string {
  return crypto.createHash('sha256').update(`${method} ${path}\n${body}`).digest('hex')
}

export type IdemCheck =
  | { kind: 'proceed' }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'conflict' }

export async function claimIdempotency(
  service: SupabaseClient,
  boxId: string,
  key: string,
  reqHash: string,
): Promise<IdemCheck> {
  const { error } = await service
    .from('api_idempotency_keys')
    .insert({ box_id: boxId, idempotency_key: key, request_hash: reqHash })
  if (!error) return { kind: 'proceed' }
  // Fail-open on a non-dup DB error: don't block a legit write on the idempotency store.
  if (error.code !== '23505') {
    console.error('[idempotency] claim failed:', error)
    return { kind: 'proceed' }
  }
  const { data } = await service
    .from('api_idempotency_keys')
    .select('request_hash, response_status, response_body')
    .eq('box_id', boxId)
    .eq('idempotency_key', key)
    .maybeSingle()
  if (!data) return { kind: 'proceed' }
  if (data.request_hash !== reqHash) return { kind: 'conflict' }
  if (data.response_status == null) {
    // A concurrent request holds the slot but hasn't finished — tell the caller to retry.
    return { kind: 'replay', status: 409, body: { error: { code: 'conflict', message: 'A request with this Idempotency-Key is in progress.' } } }
  }
  return { kind: 'replay', status: data.response_status as number, body: data.response_body }
}

export async function storeIdempotentResult(
  service: SupabaseClient,
  boxId: string,
  key: string,
  status: number,
  body: unknown,
): Promise<void> {
  try {
    await service
      .from('api_idempotency_keys')
      .update({ response_status: status, response_body: body })
      .eq('box_id', boxId)
      .eq('idempotency_key', key)
  } catch (e) {
    console.error('[idempotency] store failed:', e)
  }
}
