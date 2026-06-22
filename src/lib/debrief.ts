// Class debrief (#98): pure validation. No Supabase (coverage-gated).
export function validateDebrief(body: string): string | null {
  if (!body || !body.trim()) return 'Write a short recap first.'
  if (body.trim().length > 2000) return 'Recap is too long (max 2000 characters).'
  return null
}
