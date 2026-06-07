'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseBatch, type ParsedDay } from '../_lib/parse-batch'

export type ImportStatus = 'NEW' | 'REPLACE' | 'BLOCKED' | 'INVALID'

export type PreviewRow = {
  date: string
  title: string
  scoringType: string
  status: ImportStatus
  message: string
}

type Supa = Awaited<ReturnType<typeof createClient>>

async function authStaff(supabase: Supa): Promise<{ userId: string; boxId: string } | { error: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can program WODs.' }
  }
  return { userId: user.id, boxId: profile.box_id }
}

// Returns one PreviewRow per parsed row, in the SAME order as `parsed`
// (callers rely on index alignment to pick writable rows). Two queries total.
async function classify(supabase: Supa, boxId: string, parsed: ParsedDay[]): Promise<PreviewRow[]> {
  const valid = parsed.filter((p) => p.error === null)
  const dates = valid.map((p) => p.date)

  const existingByDate = new Map<string, string>() // date -> workout id
  if (dates.length) {
    const { data: rows } = await supabase
      .from('workouts')
      .select('id, date')
      .eq('box_id', boxId)
      .in('date', dates)
    for (const r of (rows ?? []) as { id: string; date: string }[]) existingByDate.set(r.date, r.id)
  }

  const scored = new Set<string>()
  const ids = [...existingByDate.values()]
  if (ids.length) {
    const { data: scoreRows } = await supabase
      .from('workout_scores')
      .select('workout_id')
      .in('workout_id', ids)
    for (const s of (scoreRows ?? []) as { workout_id: string }[]) scored.add(s.workout_id)
  }

  return parsed.map((p) => {
    const cell = { date: p.date, title: p.title, scoringType: p.scoringType }
    if (p.error !== null) return { ...cell, status: 'INVALID' as const, message: p.error }
    const id = existingByDate.get(p.date)
    if (!id) return { ...cell, status: 'NEW' as const, message: 'New day' }
    if (scored.has(id)) return { ...cell, status: 'BLOCKED' as const, message: 'Athletes have logged scores — skipped' }
    return { ...cell, status: 'REPLACE' as const, message: 'Replaces existing draft' }
  })
}

export async function previewImport(text: string): Promise<{ error: string | null; rows: PreviewRow[] }> {
  const supabase = await createClient()
  const auth = await authStaff(supabase)
  if ('error' in auth) return { error: auth.error, rows: [] }

  const parsed = parseBatch(text)
  const rows = await classify(supabase, auth.boxId, parsed)
  return { error: null, rows }
}

export async function commitImport(text: string): Promise<{ error: string | null; written: number; rows: PreviewRow[] }> {
  const supabase = await createClient()
  const auth = await authStaff(supabase)
  if ('error' in auth) return { error: auth.error, written: 0, rows: [] }

  const parsed = parseBatch(text)
  const rows = await classify(supabase, auth.boxId, parsed)

  // Index alignment: rows[i] corresponds to parsed[i] (classify maps over parsed).
  // Robust against duplicate dates (a later INVALID dup must not unwrite the first).
  const toWrite = parsed.filter((_, i) => rows[i].status === 'NEW' || rows[i].status === 'REPLACE')
  if (toWrite.length === 0) return { error: null, written: 0, rows }

  const insertRows = toWrite.map((p) => ({
    box_id: auth.boxId,
    date: p.date,
    title: p.title,
    description: p.description,
    scoring_type: p.scoringType,
    strength_title: null,
    strength_description: null,
    strength_lift: null,
    strength_sets: null,
    created_by: auth.userId,
  }))

  const { error } = await supabase.from('workouts').upsert(insertRows, { onConflict: 'box_id,date' })
  if (error) return { error: error.message, written: 0, rows }

  revalidatePath('/dashboard/programming')
  revalidatePath('/dashboard/wod')
  return { error: null, written: toWrite.length, rows }
}
