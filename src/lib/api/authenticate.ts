import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { env } from '@/env'
import { hashApiKey, type ApiScope } from './api-key'

export type ApiAuth =
  | { ok: true; keyId: string; boxId: string; scopes: ApiScope[] }
  | { ok: false; status: 401; code: 'unauthorized'; message: string }

// Same response for missing / malformed / unknown / revoked — no oracle.
const UNAUTHORIZED: ApiAuth = {
  ok: false,
  status: 401,
  code: 'unauthorized',
  message: 'Invalid or missing API key.',
}

/**
 * Resolve a `Authorization: Bearer ck_live_…` header to a box + scopes.
 * The hash lookup (not a string compare of the secret) is the only secret-keyed
 * step, so timing doesn't leak the key. Returns the same 401 for any failure.
 */
export async function authenticateApiKey(req: Request): Promise<ApiAuth> {
  if (!env.API_KEY_PEPPER) return UNAUTHORIZED // API not configured → no valid keys exist
  const header = req.headers.get('authorization') ?? ''
  const m = header.match(/^Bearer\s+(ck_live_[A-Za-z0-9_-]+)$/)
  if (!m) return UNAUTHORIZED

  const hash = hashApiKey(m[1], env.API_KEY_PEPPER)
  const service = createServiceClient()
  const { data, error } = await service
    .from('api_keys')
    .select('id, box_id, scopes, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle()
  if (error || !data || data.revoked_at) return UNAUTHORIZED

  void touchLastUsed(service, data.id as string, data.box_id as string)
  return {
    ok: true,
    keyId: data.id as string,
    boxId: data.box_id as string,
    scopes: ((data.scopes ?? []) as ApiScope[]),
  }
}

// Best-effort, throttled (only when >60s stale) so we don't write a hot row on
// every request. Box-scoped (defense-in-depth) and never blocks/fails the request.
async function touchLastUsed(service: SupabaseClient, keyId: string, boxId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 60_000).toISOString()
    await service
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyId)
      .eq('box_id', boxId)
      .or(`last_used_at.is.null,last_used_at.lt.${cutoff}`)
  } catch {
    /* ignore */
  }
}
