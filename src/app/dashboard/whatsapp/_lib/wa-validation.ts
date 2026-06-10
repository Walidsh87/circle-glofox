import { z } from 'zod'

const templateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  contentSid: z.string().regex(/^HX[0-9a-f]{32}$/),
  bodyPreview: z.string().trim().min(1).max(1024),
  varCount: z.number().int().min(0).max(5),
})

export function validateWaTemplate(name: string, contentSid: string, bodyPreview: string, varCount: number): string | null {
  const r = templateSchema.safeParse({ name, contentSid, bodyPreview, varCount })
  if (!r.success) {
    const path = r.error.issues[0]?.path[0]
    if (path === 'name') return 'Name must be 1–80 characters.'
    if (path === 'contentSid') return 'Content SID must be HX followed by 32 hex characters.'
    if (path === 'bodyPreview') return 'Body preview must be 1–1,024 characters.'
    return 'Variable count must be between 0 and 5.'
  }
  return null
}

const AUDIENCES = ['all', 'paid', 'unpaid', 'trial', 'frozen'] as const

export function validateWaCampaign(templateId: string | null, varValues: Record<string, string>, varCount: number, audienceStatus: string): string | null {
  if (!templateId) return 'Choose a template.'
  for (let i = 1; i <= varCount; i++) {
    if (!varValues[String(i)]?.trim()) return `Fill in variable {{${i}}}.`
  }
  if (!(AUDIENCES as readonly string[]).includes(audienceStatus)) return 'Please choose a valid audience.'
  return null
}
