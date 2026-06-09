import { z } from 'zod'

const schema = z.object({
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(10000),
  audienceStatus: z.enum(['all', 'paid', 'unpaid', 'trial', 'frozen']),
})

export function validateBroadcast(subject: string, body: string, audienceStatus: string): string | null {
  const r = schema.safeParse({ subject, body, audienceStatus })
  if (!r.success) {
    const path = r.error.issues[0]?.path[0]
    if (path === 'subject') return 'Subject must be 1–150 characters.'
    if (path === 'body') return 'Message body must be 1–10,000 characters.'
    return 'Please choose a valid audience.'
  }
  return null
}
