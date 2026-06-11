'use server'

import { requireManagerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { loadCandidates } from '../_lib/load-candidates'
import { selectRecipients, type Segment } from '@/lib/broadcast-audience'

type Preview = { error: string | null; included?: number; optedOut?: number; noEmail?: number }

export async function previewAudience(audienceStatus: string, tag: string | null): Promise<Preview> {
  const auth = await requireManagerAction('Only owners or admins can send broadcasts.')
  if ('error' in auth) return { error: auth.error }
  const { profile: caller } = auth

  const service = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const candidates = await loadCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoEmail } = selectRecipients(candidates, { status: audienceStatus as Segment, tag })
  return { error: null, included: included.length, optedOut: skippedOptedOut.length, noEmail: skippedNoEmail.length }
}
