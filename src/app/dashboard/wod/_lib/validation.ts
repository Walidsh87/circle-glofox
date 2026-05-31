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
