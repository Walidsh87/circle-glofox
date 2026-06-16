'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { validateWalkIn } from '../_lib/validation'
import { convertLeadCore } from '@/lib/convert-lead'
import { createMemberCore } from '@/lib/members'
import { assignMembershipCore } from '@/lib/memberships'

type Input = {
  leadId?: string
  fullName: string
  email: string
  phone?: string
  source?: string
  planId: string
  planName: string
  monthlyPrice?: number | null
  stripePriceId?: string | null
}
type State = { error: string | null; memberId?: string | null }

export async function deskSignUp(input: Input): Promise<State> {
  const err = validateWalkIn({ mode: 'signup', fullName: input.fullName, email: input.email, planId: input.planId })
  if (err) return { error: err }

  const auth = await requireStaffAction('Only staff can use the front desk.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth
  const service = createServiceClient()

  // Get an athlete id: convert the matched lead, or create a fresh member.
  let athleteId: string
  if (input.leadId) {
    const conv = await convertLeadCore(service, input.leadId, profile.box_id)
    if (conv.error || !conv.athleteId) return { error: conv.error ?? 'Could not convert the lead.' }
    athleteId = conv.athleteId
  } else {
    const made = await createMemberCore(service, {
      boxId: profile.box_id,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      role: 'athlete',
    })
    if (made.error || !made.athleteId) return { error: made.error ?? 'Could not create the member.' }
    athleteId = made.athleteId
  }

  const today = new Date().toISOString().slice(0, 10)
  const assigned = await assignMembershipCore(service, {
    boxId: profile.box_id,
    athleteId,
    planName: input.planName,
    monthlyPrice: input.monthlyPrice ?? null,
    startDate: today,
    planId: input.planId,
    stripePriceId: input.stripePriceId ?? null,
  })
  if (assigned.error) return { error: assigned.error, memberId: athleteId }

  revalidatePath('/dashboard/desk')
  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/payments')
  return { error: null, memberId: athleteId }
}
