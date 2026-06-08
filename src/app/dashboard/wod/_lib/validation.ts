import { z } from 'zod'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'

export type StrengthSet = { sets: number; reps: number; percentage: number }

const LIFT_VALUES = LIFT_NAMES.map((l) => l.value) as [string, ...string[]]

const setSchema = z.object({
  sets: z.number().int().positive(),
  reps: z.number().int().positive(),
  percentage: z.number().positive().max(200),
})

const prescriptionSchema = z.object({
  lift: z.enum(LIFT_VALUES),
  sets: z.array(setSchema).min(1),
})

// Empty lift => no prescription, which is valid. Otherwise lift + sets must be valid.
export function validateStrengthPrescription(lift: string, sets: unknown): string | null {
  if (!lift) return null
  const result = prescriptionSchema.safeParse({ lift, sets })
  if (!result.success) {
    return 'Pick a lift from the list and add at least one set with positive sets, reps, and %.'
  }
  return null
}

export type ScalingTier = { label: string; description: string }

const scalingTierSchema = z.object({
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
})

// null/undefined or [] => no tiers, valid. Otherwise up to 6 tiers, each with a
// non-empty label + description.
export function validateScaling(raw: unknown): string | null {
  if (raw == null) return null
  const result = z.array(scalingTierSchema).max(6).safeParse(raw)
  if (!result.success) return 'Each scaling tier needs a label and a description (max 6 tiers).'
  return null
}
