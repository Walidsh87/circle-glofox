export type ResendEvent =
  | { kind: 'opened'; emailId: string }
  | { kind: 'clicked'; emailId: string }
  | { kind: 'suppress'; emailId: string }
  | { kind: 'ignore' }

export function parseResendEvent(rawBody: string): ResendEvent {
  let payload: { type?: string; data?: { email_id?: string } }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return { kind: 'ignore' }
  }
  const emailId = payload.data?.email_id
  if (!emailId) return { kind: 'ignore' }
  switch (payload.type) {
    case 'email.opened': return { kind: 'opened', emailId }
    case 'email.clicked': return { kind: 'clicked', emailId }
    case 'email.bounced':
    case 'email.complained': return { kind: 'suppress', emailId }
    default: return { kind: 'ignore' }
  }
}
