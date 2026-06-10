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

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

export function withinSessionWindow(lastInboundIso: string | null, nowIso: string): boolean {
  if (!lastInboundIso) return false
  return new Date(nowIso).getTime() - new Date(lastInboundIso).getTime() < SESSION_WINDOW_MS
}
