'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function moveChecklistItem(id: string, direction: 'up' | 'down'): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage checklists.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { data: allRows } = await supabase.from('checklist_items').select('id, kind, position').eq('box_id', caller.box_id)
  const rows = (allRows ?? []) as { id: string; kind: string; position: number }[]
  const item = rows.find((r) => r.id === id)
  if (!item) return { error: 'Step not found.' }
  const sameKind = rows.filter((r) => r.kind === item.kind).sort((a, b) => a.position - b.position)
  const idx = sameKind.findIndex((r) => r.id === id)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= sameKind.length) return { error: null } // already at the edge
  const neighbour = sameKind[swapIdx]

  await supabase.from('checklist_items').update({ position: neighbour.position }).eq('id', item.id).eq('box_id', caller.box_id)
  await supabase.from('checklist_items').update({ position: item.position }).eq('id', neighbour.id).eq('box_id', caller.box_id)
  revalidatePath('/dashboard/settings')
  return { error: null }
}
