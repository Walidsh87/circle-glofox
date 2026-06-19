'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { actionError } from '@/lib/action-error'

// Revokes a key (sets revoked_at; checked on every API request). Owner-only,
// box-scoped (can't revoke another gym's key), audited.
export async function revokeApiKey(keyId: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage API keys.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth

  if (!keyId || !/^[0-9a-f-]{36}$/i.test(keyId)) return { error: 'Invalid key ID.' }

  const service = createServiceClient()
  const { data, error } = await service
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('box_id', profile.box_id)
    .is('revoked_at', null)
    .select('id, label')
    .maybeSingle()
  if (error) return actionError('revokeApiKey', error, 'Could not revoke the key.')
  if (!data) return { error: 'Key not found (or already revoked).' }

  await logAudit(service, {
    boxId: profile.box_id, actorId: user.id, actorName: profile.full_name,
    action: 'api.key_revoked', target: keyId, details: { label: data.label },
  })
  revalidatePath('/dashboard/settings')
  return { error: null }
}
