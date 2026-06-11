'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { validateLeadSubmission } from '@/lib/lead-capture'

export type LeadInput = { name: string; email: string; phone: string; message: string; company: string; ref?: string }

export async function submitLead(gymSlug: string, input: LeadInput): Promise<{ ok: boolean; error?: string }> {
  // Honeypot: a real user never fills a hidden field. Absorb silently.
  if (input.company.trim()) return { ok: true }

  const vErr = validateLeadSubmission(input.name, input.email, input.phone)
  if (vErr) return { ok: false, error: vErr }
  if (input.message.length > 1000) return { ok: false, error: 'Message is too long.' }

  const service = createServiceClient()
  const { data: box } = await service.from('boxes').select('id').eq('slug', gymSlug).single()
  if (!box) return { ok: false, error: 'This form is not available.' }

  let referredBy: string | null = null
  const ref = input.ref?.trim()
  if (ref) {
    const { data: referrer } = await service.from('profiles').select('id').eq('box_id', box.id).eq('referral_code', ref).maybeSingle()
    referredBy = (referrer?.id as string | undefined) ?? null
  }

  const { error } = await service.from('leads').insert({
    box_id: box.id,
    full_name: input.name.trim(),
    email: input.email.trim().toLowerCase() || null,
    phone: input.phone.trim() || null,
    notes: input.message.trim() || null,
    source: 'widget',
    referred_by: referredBy,
  })
  if (error) return { ok: false, error: 'Something went wrong. Please try again.' }
  return { ok: true }
}
