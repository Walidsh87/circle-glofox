import { TRIGGER_TYPES } from '@/lib/automations'
import { validateBlocks } from '@/lib/email-blocks'
import type { SequenceStep } from '@/lib/sequences'

const MAX_STEPS = 20

export function validateSequence(name: string, triggerType: string, triggerDays: number | null, steps: SequenceStep[]): string | null {
  const cleanName = name.trim()
  if (!cleanName || cleanName.length > 120) return 'Name must be 1–120 characters.'
  if (!(TRIGGER_TYPES as readonly string[]).includes(triggerType)) return 'Choose a valid trigger.'
  if (triggerType === 'birthday') {
    if (triggerDays !== null) return 'The birthday trigger does not take a day count.'
  } else if (triggerDays === null || !Number.isInteger(triggerDays) || triggerDays < 0) {
    return 'Enter a whole number of days (0 or more).'
  }
  if (!Array.isArray(steps) || steps.length === 0) return 'Add at least one step.'
  if (steps.length > MAX_STEPS) return `A sequence can have at most ${MAX_STEPS} steps.`
  let prev = -1
  for (const s of steps) {
    if (!Number.isInteger(s.offset_days) || s.offset_days < 0) return 'Each step needs a day offset of 0 or more.'
    if (s.offset_days < prev) return 'Step day offsets must not decrease.'
    prev = s.offset_days
    const subject = s.subject.trim()
    if (!subject || subject.length > 150) return 'Each step needs a subject of 1–150 characters.'
    const bErr = validateBlocks(s.body_blocks)
    if (bErr) return bErr
  }
  return null
}
