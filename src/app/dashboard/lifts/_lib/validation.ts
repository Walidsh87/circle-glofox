import { z } from 'zod'

const liftSchema = z.object({
  liftName: z.string().min(1),
  weightKg: z.number().positive().finite(),
})

export function validateLiftInput(liftName: string, weightKg: number): string | null {
  const result = liftSchema.safeParse({ liftName, weightKg })
  if (!result.success) return 'Select a lift and enter a valid weight.'
  return null
}
