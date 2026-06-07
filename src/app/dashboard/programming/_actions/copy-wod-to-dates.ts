'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateTemplateInput } from '../_lib/validation'
import { validateStrengthPrescription, type StrengthSet } from '@/app/dashboard/wod/_lib/validation'

export type WodFields = {
  title: string
  description: string
  scoringType: string
  strengthTitle?: string | null
  strengthDescription?: string | null
  strengthLift?: string | null
  strengthSets?: StrengthSet[] | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function copyWodToDates(fields: WodFields, dates: string[]): Promise<{ error: string | null }> {
  const validationError = validateTemplateInput(fields.title, fields.description, fields.scoringType)
  if (validationError) return { error: validationError }

  const clean = Array.from(new Set((dates ?? []).filter((d) => DATE_RE.test(d))))
  if (clean.length === 0) return { error: 'Pick at least one date to copy to.' }

  const lift = fields.strengthLift?.trim() || ''
  const prescriptionError = validateStrengthPrescription(lift, fields.strengthSets ?? [])
  if (prescriptionError) return { error: prescriptionError }

  const supabase = await createClient()
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

  const rows = clean.map((date) => ({
    box_id: profile.box_id,
    date,
    title: fields.title.trim(),
    description: fields.description.trim(),
    scoring_type: fields.scoringType,
    strength_title: fields.strengthTitle?.trim() || null,
    strength_description: fields.strengthDescription?.trim() || null,
    strength_lift: lift || null,
    strength_sets: lift ? (fields.strengthSets ?? []) : null,
    created_by: user.id,
  }))

  const { error } = await supabase.from('workouts').upsert(rows, { onConflict: 'box_id,date' })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/programming')
  revalidatePath('/dashboard/wod')
  return { error: null }
}
