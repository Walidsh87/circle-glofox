'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validatePayRate } from '@/lib/reports/payroll'

export async function savePayRate(
  coachId: string,
  baseType: string | null,
  baseRate: number | null,
  ptRate: number | null,
): Promise<{ error: string | null }> {
  if (!coachId) return { error: 'Missing coach.' }

  const auth = await requireOwnerAction('Only owners can set pay rates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const invalid = validatePayRate(baseType, baseRate, ptRate)
  if (invalid) return { error: invalid }

  // Owner-only RLS on coach_pay_rates — the RLS client is the right tool here.
  const { error } = await supabase.from('coach_pay_rates').upsert({
    box_id: profile.box_id,
    coach_id: coachId,
    base_type: baseType,
    base_rate_aed: baseRate,
    pt_rate_aed: ptRate,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'box_id,coach_id' })
  if (error) return { error: 'Could not save the rate. Please try again.' }

  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}
