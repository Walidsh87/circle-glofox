/**
 * Constrain a user-supplied post-auth `next` target to a same-origin relative path,
 * so `?next=https://evil.com` (or `//evil.com`, backslash tricks) can't turn the auth
 * callback into an open redirect. Anything not a single-rooted `/path` falls back.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/')) return '/dashboard' // absolute URL, scheme, or non-rooted
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard' // scheme-relative / backslash
  return raw
}
