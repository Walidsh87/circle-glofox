'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateChecklistItem, type ChecklistKind } from '@/lib/checklists'

export async function saveChecklistItem(input: { kind: ChecklistKind; label: string; id?: string | null }): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage checklists.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const vErr = validateChecklistItem(input.label)
  if (vErr) return { error: vErr }
  const label = input.label.trim()

  if (input.id) {
    const { error } = await supabase.from('checklist_items').update({ label }).eq('id', input.id).eq('box_id', caller.box_id)
    if (error) return { error: error.message }
  } else {
    const { data: rows } = await supabase.from('checklist_items').select('position').eq('box_id', caller.box_id).eq('kind', input.kind)
    const maxPos = ((rows ?? []) as { position: number }[]).reduce((m, r) => Math.max(m, r.position), -1)
    const { error } = await supabase.from('checklist_items').insert({ box_id: caller.box_id, kind: input.kind, label, position: maxPos + 1 })
    if (error) return { error: error.message }
  }
  revalidatePath('/dashboard/settings')
  return { error: null }
}
