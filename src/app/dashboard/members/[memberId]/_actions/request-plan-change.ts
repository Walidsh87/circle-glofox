'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { requestPlanChangeViaApi } from '@/lib/api/plan-change-core'
import { revalidatePath } from 'next/cache'

export async function requestPlanChange(planId: string): Promise<{ error: string | null }> {
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: profile } = await supabase.from('profiles').select('role, box_id, full_name').eq('id', user.id).single()
  if (!profile || profile.role !== 'athlete') return { error: 'Only members can request plan changes.' }

  // The rails + task insert live in the shared core (also serving GET/POST /api/app/plan-change) —
  // athletes have no RLS on plans/tasks, so it runs service-role with rows pinned to box + self.
  const service = createServiceClient()
  const res = await requestPlanChangeViaApi(service, user.id, profile.box_id, planId)
  if (!res.ok) return { error: res.message }

  revalidatePath(`/dashboard/members/${user.id}`)
  return { error: null }
}
