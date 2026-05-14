'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

type State = { error: string | null }

export async function saveMembership(prevState: State, formData: FormData): Promise<State> {
  const athleteId = formData.get('athleteId') as string
  const planName = (formData.get('planName') as string)?.trim()
  const monthlyPrice = parseFloat(formData.get('monthlyPrice') as string) || null
  const startDate = formData.get('startDate') as string

  if (!athleteId || !planName || !startDate) {
    return { error: 'Athlete, plan name, and start date are required.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage memberships.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service.from('memberships').insert({
    box_id: profile.box_id,
    athlete_id: athleteId,
    plan_name: planName,
    monthly_price_aed: monthlyPrice,
    start_date: startDate,
    payment_status: 'unpaid',
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
