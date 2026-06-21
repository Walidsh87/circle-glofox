'use server'

import { createClient } from '@/lib/supabase/server'
import { getProviderForBox } from '@/lib/psp'
import { env } from '@/env'
import { validateBuyProgramInput } from '../_lib/validation'

type State = { error: string | null; url: string | null }

export async function buyProgram(templateId: string): Promise<State> {
  const validationError = validateBuyProgramInput(templateId)
  if (validationError) return { error: validationError, url: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', url: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, email, role')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.', url: null }
  if (profile.role !== 'athlete') return { error: 'Only members can purchase programs.', url: null }

  // RLS member_programs_published_read restricts this to PUBLISHED templates in the
  // athlete's own box — a member can only buy a real, published program.
  const { data: tpl } = await supabase
    .from('member_programs')
    .select('id, title, price_aed')
    .eq('id', templateId)
    .eq('box_id', profile.box_id)
    .eq('is_template', true)
    .eq('published', true)
    .maybeSingle()
  if (!tpl || tpl.price_aed == null || Number(tpl.price_aed) <= 0) {
    return { error: 'Program not available.', url: null }
  }

  // Re-buy guard: block while an ACTIVE copy of this template already exists.
  const { data: owned } = await supabase
    .from('member_programs')
    .select('id')
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
    .eq('is_template', false)
    .eq('source_template_id', templateId)
    .eq('active', true)
    .maybeSingle()
  if (owned) return { error: 'You already own this program.', url: null }

  try {
    const provider = await getProviderForBox(profile.box_id)
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const session = await provider.createProgramCheckout({
      programTemplateId: tpl.id,
      athleteId: user.id,
      boxId: profile.box_id,
      programName: tpl.title,
      priceAed: Number(tpl.price_aed),
      customerEmail: profile.email ?? null,
      successUrl: `${baseUrl}/dashboard/shop?purchase=success`,
      cancelUrl: `${baseUrl}/dashboard/shop`,
    })
    return { error: null, url: session.url }
  } catch (e) {
    console.error('buyProgram failed:', e)
    return { error: 'Could not start checkout. Please try again later.', url: null }
  }
}
