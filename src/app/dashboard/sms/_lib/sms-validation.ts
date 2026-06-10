import { z } from 'zod'

const schema = z.object({
  body: z.string().trim().min(1).max(1000),
  audienceStatus: z.enum(['all', 'paid', 'unpaid', 'trial', 'frozen']),
})

export function validateSmsCampaign(body: string, audienceStatus: string): string | null {
  const r = schema.safeParse({ body, audienceStatus })
  if (!r.success) {
    const path = r.error.issues[0]?.path[0]
    if (path === 'body') return 'Message must be 1–1,000 characters.'
    return 'Please choose a valid audience.'
  }
  return null
}
