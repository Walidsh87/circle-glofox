// PII scrubbing for Sentry events. The app's server `console.error` calls pass
// full DB error objects to Sentry; an unhandled throw could carry member data
// (emails, phones, government IDs) into an event. This makes scrubbing ENFORCED
// rather than relying on errors never embedding PII.

// Substring match (no word boundaries) is intentional and privacy-biased: a key
// like `creditcard` or `user_email` should still be redacted. Over-redaction of
// an unrelated key (e.g. a hypothetical `grid_number`) is the safe failure
// direction — it only loses debugging signal, never leaks PII.
const PII_KEY = /(e?mail|phone|password|passwd|secret|token|authorization|cookie|id_number|national_id|iban|card|cvv|ssn)/i

/**
 * Deep-walk a value and redact any property whose KEY looks like PII. Keys, not
 * values, are matched — fast and predictable. `seen` maps each original object
 * to its scrubbed copy, so shared references AND cycles return the SCRUBBED copy
 * (never the raw object) and recursion always terminates.
 */
export function scrubPii(value: unknown, seen = new Map<object, unknown>()): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return seen.get(value)
    const out: unknown[] = []
    seen.set(value, out)
    for (const v of value) out.push(scrubPii(v, seen))
    return out
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return seen.get(value)
    const out: Record<string, unknown> = {}
    seen.set(value, out)
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = PII_KEY.test(k) ? '[redacted]' : scrubPii(v, seen)
    }
    return out
  }
  return value
}

type SentryLikeEvent = {
  user?: { id?: unknown; email?: unknown; username?: unknown; ip_address?: unknown } | null
  extra?: Record<string, unknown>
  contexts?: Record<string, unknown>
  request?: { data?: unknown; cookies?: unknown; headers?: unknown }
}

/**
 * Sentry `beforeSend` hook: strip PII from the user object, scrub `extra` /
 * `contexts` / `request.data` / `request.headers`, and drop raw cookies.
 * Mutates and returns the same event object (Sentry's contract).
 */
export function scrubEvent<T extends SentryLikeEvent>(event: T): T {
  if (event.user) {
    delete event.user.email
    delete event.user.username
    delete event.user.ip_address
  }
  if (event.extra) event.extra = scrubPii(event.extra) as Record<string, unknown>
  if (event.contexts) event.contexts = scrubPii(event.contexts) as Record<string, unknown>
  if (event.request) {
    if (event.request.data) event.request.data = scrubPii(event.request.data)
    if (event.request.headers) event.request.headers = scrubPii(event.request.headers)
    delete event.request.cookies
  }
  return event
}
