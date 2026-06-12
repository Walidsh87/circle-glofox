'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function resetStaffMfa(profileId: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can reset staff MFA.')
  if ('error' in auth) return { error: auth.error }
  const { profile: caller } = auth

  const service = createServiceClient()
  const { data: target } = await service.from('profiles').select('role').eq('id', profileId).eq('box_id', caller.box_id).maybeSingle()
  if (!target) return { error: 'Staff member not found in your gym.' }
  if (target.role === 'athlete') return { error: 'Not a staff account.' }

  const { data, error: listErr } = await service.auth.admin.mfa.listFactors({ userId: profileId })
  if (listErr) return { error: listErr.message }
  const factors = data?.factors ?? []
  if (factors.length === 0) return { error: 'No MFA enrolled.' }

  for (const f of factors) {
    const { error } = await service.auth.admin.mfa.deleteFactor({ id: f.id, userId: profileId })
    if (error) return { error: error.message }
  }
  revalidatePath('/dashboard/members')
  return { error: null }
}
