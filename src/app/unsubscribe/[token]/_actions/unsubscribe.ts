'use server'

import { createServiceClient } from '@/lib/supabase/service'

export async function unsubscribe(token: string): Promise<{ gymName: string | null }> {
  if (!token) return { gymName: null }
  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('id, box_id').eq('unsubscribe_token', token).maybeSingle()
  if (!profile) return { gymName: null }
  await service.from('profiles').update({ marketing_opt_out: true }).eq('id', profile.id)
  const { data: box } = await service.from('boxes').select('name').eq('id', profile.box_id).single()
  return { gymName: box?.name ?? null }
}
