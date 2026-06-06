'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validatePackageInput } from '../_lib/validation'

type State = { error: string | null }

export async function createPackage(prevState: State, formData: FormData): Promise<State> {
  const name = (formData.get('name') as string)?.trim()
  const type = formData.get('type') as string
  const creditCount = type === 'drop_in' ? 1 : parseInt(formData.get('creditCount') as string)
  const priceAed = parseFloat(formData.get('priceAed') as string)
  const expiryRaw = (formData.get('expiryDays') as string)?.trim()
  const expiryDays = expiryRaw ? parseInt(expiryRaw) : null

  const validationError = validatePackageInput(name, type, creditCount, priceAed, expiryDays)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage packages.' }
  }

  const { error } = await supabase.from('packages').insert({
    box_id: profile.box_id,
    name,
    type,
    credit_count: creditCount,
    price_aed: priceAed,
    expiry_days: expiryDays,
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/packages')
  return { error: null }
}
