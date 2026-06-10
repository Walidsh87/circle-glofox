'use server'

import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { validateLeadSubmission } from '@/lib/lead-capture'

export type LeadInput = { name: string; email: string; phone: string; message: string; company: string }

export async function submitLead(gymSlug: string, input: LeadInput): Promise<{ ok: boolean; error?: string }> {
  // Honeypot: a real user never fills a hidden field. Absorb silently.
  if (input.company.trim()) return { ok: true }

  const vErr = validateLeadSubmission(input.name, input.email, input.phone)
  if (vErr) return { ok: false, error: vErr }
  if (input.message.length > 1000) return { ok: false, error: 'Message is too long.' }

  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: box } = await service.from('boxes').select('id').eq('slug', gymSlug).single()
  if (!box) return { ok: false, error: 'This form is not available.' }

  const { error } = await service.from('leads').insert({
    box_id: box.id,
    full_name: input.name.trim(),
    email: input.email.trim().toLowerCase() || null,
    phone: input.phone.trim() || null,
    notes: input.message.trim() || null,
    source: 'widget',
  })
  if (error) return { ok: false, error: 'Something went wrong. Please try again.' }
  return { ok: true }
}
