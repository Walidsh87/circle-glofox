'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { validateStripePlanInput } from '../_lib/validation'
import { getProviderForBox } from '@/lib/psp'

type State = { error: string | null; priceId: string | null }

export async function createStripePlan(prevState: State, formData: FormData): Promise<State> {
  const planName = (formData.get('planName') as string)?.trim()
  const priceAed = parseFloat(formData.get('priceAed') as string)

  const validationError = validateStripePlanInput(planName, priceAed)
  if (validationError) return { error: validationError, priceId: null }

  const auth = await requireOwnerAction('Only owners can create plans.')
  if ('error' in auth) return { error: auth.error, priceId: null }
  const { profile } = auth

  try {
    const provider = await getProviderForBox(profile.box_id)
    const { planRef } = await provider.createPlan({ planName, monthlyPriceAed: priceAed })
    return { error: null, priceId: planRef }
  } catch (e) {
    console.error('createPlan failed:', e)
    return { error: 'Could not create the plan. Please check your provider settings.', priceId: null }
  }
}
