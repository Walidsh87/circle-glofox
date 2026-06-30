import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { env } from '@/env'
import { checkApiRateLimit } from '@/lib/rate-limit'
import { jsonError } from './respond'

export type MemberCtx = { userId: string; boxId: string; role: string }
type Handler = (req: Request, ctx: MemberCtx) => Promise<Response>

/**
 * Wraps a member-facing app route: verify the caller's Supabase access token
 * (`Authorization: Bearer <jwt>`) → resolve their box + role from THEIR OWN profile
 * row → per-user rate-limit → call the handler.
 *
 * Unlike `withApiKey` (machine, box-wide), this is an END-USER credential: the
 * mobile app holds the member's JWT, so `userId`/`boxId` come from the verified
 * token + their profile, NEVER from the request body. A handler therefore can only
 * ever act as the authenticated member, in their own box — RLS-equivalent identity
 * for the service-role orchestration the handler runs.
 */
export function withMemberAuth(handler: Handler) {
  return async (req: Request): Promise<Response> => {
    const header = req.headers.get('authorization') ?? ''
    const m = header.match(/^Bearer\s+(.+)$/)
    if (!m) return jsonError('unauthorized', 'Missing or malformed bearer token.', 401, { 'WWW-Authenticate': 'Bearer' })
    const token = m[1].trim()

    // Verify the JWT against GoTrue (validates signature + expiry server-side).
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const { data: { user }, error } = await anon.auth.getUser(token)
    if (error || !user) return jsonError('unauthorized', 'Invalid or expired session.', 401, { 'WWW-Authenticate': 'Bearer' })

    if (!(await checkApiRateLimit(`member:${user.id}`))) {
      return jsonError('rate_limited', 'Too many requests. Slow down and retry.', 429, { 'Retry-After': '60' })
    }

    // Tenant + role from the user's OWN profile (service client bypasses the profiles
    // column allowlist). Never read box_id from the request.
    const service = createServiceClient()
    const { data: profile } = await service
      .from('profiles')
      .select('box_id, role')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.box_id) return jsonError('forbidden', 'No gym profile for this account.', 403)

    try {
      return await handler(req, { userId: user.id, boxId: profile.box_id as string, role: (profile.role as string) ?? 'athlete' })
    } catch (e) {
      console.error('[api/app] handler error:', e)
      return jsonError('internal', 'Something went wrong.', 500)
    }
  }
}
