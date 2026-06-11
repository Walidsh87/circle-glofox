'use server'

import { requireManagerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { loadSmsCandidates } from '../_lib/load-sms-candidates'
import { selectSmsRecipients } from '@/lib/sms'
import type { Segment } from '@/lib/broadcast-audience'

type Preview = { error: string | null; included?: number; optedOut?: number; noPhone?: number }

export async function previewSmsAudience(audienceStatus: string, tag: string | null): Promise<Preview> {
  const auth = await requireManagerAction('Only owners or admins can send SMS.')
  if ('error' in auth) return { error: auth.error }
  const { profile: caller } = auth

  const service = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const candidates = await loadSmsCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoPhone } = selectSmsRecipients(candidates, { status: audienceStatus as Segment, tag })
  return { error: null, included: included.length, optedOut: skippedOptedOut, noPhone: skippedNoPhone }
}
