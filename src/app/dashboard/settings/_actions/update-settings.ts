'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateTrn } from '@/lib/invoices'
import { RESERVED_SLUGS } from '@/app/onboarding/_lib/slug'

type State = { error: string | null; success?: boolean }

export async function updateSettings(prevState: State, formData: FormData): Promise<State> {
  const gymName = (formData.get('gymName') as string)?.trim()
  const timezone = formData.get('timezone') as string
  const slug = (formData.get('slug') as string)?.trim().toLowerCase()

  if (!gymName) return { error: 'Gym name is required.' }
  if (!slug) return { error: 'Gym URL is required.' }
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { error: 'URL must be 3–40 characters: lowercase letters, numbers, and dashes only.' }
  if (RESERVED_SLUGS.includes(slug)) return { error: 'That URL is reserved. Please choose another.' }

  const auth = await requireOwnerAction('Only owners can update settings.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()

  const stripeSecretKey = (formData.get('stripeSecretKey') as string)?.trim() || undefined
  const stripeWebhookSecret = (formData.get('stripeWebhookSecret') as string)?.trim() || undefined
  const trn = (formData.get('trn') as string)?.trim() ?? ''
  const legalName = (formData.get('legalName') as string)?.trim() ?? ''
  const billingAddress = (formData.get('billingAddress') as string)?.trim() ?? ''

  if (trn) {
    const trnError = validateTrn(trn)
    if (trnError) return { error: trnError }
  }

  const updates: Record<string, unknown> = {
    name: gymName,
    timezone,
    slug,
    trn: trn || null,
    legal_name: legalName || null,
    billing_address: billingAddress || null,
  }
  if (stripeSecretKey) updates.stripe_secret_key = stripeSecretKey
  if (stripeWebhookSecret) updates.stripe_webhook_secret = stripeWebhookSecret

  // Keep psp_credentials JSONB in sync — the provider lookup reads from it first.
  if (stripeSecretKey || stripeWebhookSecret) {
    const { data: current } = await service
      .from('boxes')
      .select('psp_credentials, stripe_secret_key, stripe_webhook_secret')
      .eq('id', profile.box_id)
      .single()
    const existing = (current?.psp_credentials ?? {}) as Record<string, unknown>
    updates.psp_provider = 'stripe'
    updates.psp_credentials = {
      ...existing,
      secret_key:     stripeSecretKey     ?? existing.secret_key     ?? current?.stripe_secret_key     ?? null,
      webhook_secret: stripeWebhookSecret ?? existing.webhook_secret ?? current?.stripe_webhook_secret ?? null,
    }
  }

  const { error } = await service
    .from('boxes')
    .update(updates)
    .eq('id', profile.box_id)

  if (error) {
    if (error.code === '23505') return { error: 'That URL is already taken. Please choose another.' }
    return actionError('updateSettings', error)
  }

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard')
  return { error: null, success: true }
}
