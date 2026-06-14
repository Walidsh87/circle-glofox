'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { convertLeadCore } from '@/lib/convert-lead'
import { revalidatePath } from 'next/cache'

export async function convertLead(
  leadId: string,
): Promise<{ error: string | null; memberId: string | null }> {
  const auth = await requireStaffAction('Only staff can manage leads.')
  if ('error' in auth) return { error: auth.error, memberId: null }
  const { profile: caller } = auth

  const service = createServiceClient()
  const { athleteId, error } = await convertLeadCore(service, leadId, caller.box_id)
  if (error) return { error, memberId: null }

  revalidatePath('/dashboard/members')
  return { error: null, memberId: athleteId }
}
