import crypto from 'node:crypto'

// Scopes a public API key may carry. Resource read/write split; `members:pii`
// is the explicit gate for member email/phone (the 7 lockdown columns from
// migration 071 are NEVER exposed regardless of scope — see serializers.ts).
export const API_SCOPES = [
  'members:read',
  'members:pii',
  'classes:read',
  'bookings:read',
  'memberships:read',
  'packages:read',
  'bookings:write',
  'leads:write',
] as const
export type ApiScope = (typeof API_SCOPES)[number]

// Scopes an owner may GRANT today. Phase 1 is read-only, so write scopes —
// though defined in the type for forward compat — are not issuable yet (no
// write routes exist; a pre-issued write key would silently gain access when
// they land). Add the write scopes here when Phase 2 routes ship.
export const GRANTABLE_SCOPES: ApiScope[] = [
  'members:read',
  'members:pii',
  'classes:read',
  'bookings:read',
  'memberships:read',
  'packages:read',
]

const KEY_PREFIX = 'ck_live_'

/**
 * Peppered SHA-256 of an API key. The key is full-entropy (256-bit CSPRNG), so
 * a fast keyed hash is safe (no brute-force surface — bcrypt/argon2 unnecessary)
 * and gives sub-ms per-request lookup. The pepper (a server env secret) means a
 * DB-only leak can't be used to forge the `key_hash` lookup.
 */
export function hashApiKey(plaintext: string, pepper: string): string {
  return crypto.createHash('sha256').update(pepper + plaintext).digest('hex')
}

/**
 * Mint a new API key. The plaintext is returned ONCE (shown to the owner, never
 * stored); only `prefix` (for display) and `hash` (for lookup) are persisted.
 */
export function generateApiKey(pepper: string): { plaintext: string; prefix: string; hash: string } {
  const plaintext = KEY_PREFIX + crypto.randomBytes(32).toString('base64url')
  return { plaintext, prefix: plaintext.slice(0, 12), hash: hashApiKey(plaintext, pepper) }
}
