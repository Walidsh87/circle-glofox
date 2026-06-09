import { z } from 'zod'
import { TRIGGER_TYPES } from '@/lib/automations'

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  triggerType: z.enum(TRIGGER_TYPES),
})

export function validateAutomation(name: string, triggerType: string, triggerDays: number | null): string | null {
  const r = schema.safeParse({ name, triggerType })
  if (!r.success) {
    const path = r.error.issues[0]?.path[0]
    if (path === 'name') return 'Name must be 1–120 characters.'
    return 'Choose a valid trigger.'
  }
  if (triggerType === 'birthday') {
    if (triggerDays !== null) return 'The birthday trigger does not take a day count.'
  } else if (triggerDays === null || !Number.isInteger(triggerDays) || triggerDays <= 0) {
    return 'Enter a positive whole number of days.'
  }
  return null
}
