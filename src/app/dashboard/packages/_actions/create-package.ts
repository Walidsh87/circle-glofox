'use server'

import { requireManagerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
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

  const auth = await requireManagerAction('Only owners or admins can manage packages.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('packages').insert({
    box_id: profile.box_id,
    name,
    type,
    credit_count: creditCount,
    price_aed: priceAed,
    expiry_days: expiryDays,
  })
  if (error) return actionError('createPackage', error)

  revalidatePath('/dashboard/packages')
  return { error: null }
}
