'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { env } from '@/env'
import { revalidatePath } from 'next/cache'
import { generateApiKey, GRANTABLE_SCOPES, type ApiScope } from '@/lib/api/api-key'
import { logAudit } from '@/lib/audit'
import { actionError } from '@/lib/action-error'

// Issues a public-API key. The plaintext is returned ONCE — only its hash is
// stored. Owner-only; audited.
export async function createApiKey(
  label: string,
  scopes: string[],
): Promise<{ error: string | null; plaintext?: string }> {
  const auth = await requireOwnerAction('Only owners can manage API keys.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth

  const name = (label ?? '').trim()
  if (!name || name.length > 80) return { error: 'Give the key a name (1–80 characters).' }
  const validScopes = (scopes ?? []).filter((s): s is ApiScope => (GRANTABLE_SCOPES as readonly string[]).includes(s))
  if (validScopes.length === 0) return { error: 'Choose at least one scope.' }
  if (!env.API_KEY_PEPPER) return { error: 'The public API is not configured (missing API_KEY_PEPPER).' }

  const { plaintext, prefix, hash } = generateApiKey(env.API_KEY_PEPPER)
  const service = createServiceClient()
  const { data, error } = await service
    .from('api_keys')
    .insert({ box_id: profile.box_id, label: name, key_hash: hash, key_prefix: prefix, scopes: validScopes, created_by: user.id })
    .select('id')
    .single()
  if (error || !data) return actionError('createApiKey', error, 'Could not create the key.')

  await logAudit(service, {
    boxId: profile.box_id, actorId: user.id, actorName: profile.full_name,
    action: 'api.key_issued', target: data.id as string, details: { label: name, prefix, scopes: validScopes },
  })
  revalidatePath('/dashboard/settings')
  return { error: null, plaintext }
}
