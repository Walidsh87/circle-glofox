'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { loadCandidates } from '../_lib/load-candidates'
import { selectRecipients, type Segment } from '@/lib/broadcast-audience'

type Preview = { error: string | null; included?: number; optedOut?: number; noEmail?: number }

export async function previewAudience(audienceStatus: string, tag: string | null): Promise<Preview> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can send broadcasts.' }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const today = new Date().toISOString().slice(0, 10)
  const candidates = await loadCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoEmail } = selectRecipients(candidates, { status: audienceStatus as Segment, tag })
  return { error: null, included: included.length, optedOut: skippedOptedOut.length, noEmail: skippedNoEmail.length }
}
