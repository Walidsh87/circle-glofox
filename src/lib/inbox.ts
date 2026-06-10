export function validateMessage(body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed) return 'Message can’t be empty.'
  if (trimmed.length > 4000) return 'Message is too long (max 4000 characters).'
  return null
}

export function messagePreview(body: string): string {
  const clean = body.replace(/\s+/g, ' ').trim()
  return clean.length > 60 ? clean.slice(0, 60) + '…' : clean
}
