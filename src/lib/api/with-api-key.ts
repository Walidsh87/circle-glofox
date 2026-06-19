import { authenticateApiKey } from './authenticate'
import { checkApiRateLimit } from '@/lib/rate-limit'
import { jsonError } from './respond'
import type { ApiScope } from './api-key'

export type ApiHandlerCtx = { boxId: string; scopes: ApiScope[]; params: Record<string, string> }
type Handler = (req: Request, ctx: ApiHandlerCtx) => Promise<Response>
type RouteCtx = { params?: Promise<Record<string, string>> }

/**
 * Wraps a v1 route handler: authenticate the API key → require `scope` → per-key
 * rate-limit → call the handler with the box injected from the KEY (never from
 * the request). Centralizing this means an individual route can't forget the
 * tenant boundary. Cross-tenant ids are a 404 inside the handler, never a 403.
 */
export function withApiKey(scope: ApiScope, handler: Handler) {
  return async (req: Request, ctx?: RouteCtx): Promise<Response> => {
    const auth = await authenticateApiKey(req)
    if (!auth.ok) return jsonError(auth.code, auth.message, auth.status, { 'WWW-Authenticate': 'Bearer' })
    if (!auth.scopes.includes(scope)) {
      return jsonError('forbidden', `This API key is missing the "${scope}" scope.`, 403)
    }
    if (!(await checkApiRateLimit(`api:${auth.keyId}`))) {
      return jsonError('rate_limited', 'Rate limit exceeded. Slow down and retry.', 429, { 'Retry-After': '60' })
    }
    const params = ctx?.params ? await ctx.params : {}
    try {
      return await handler(req, { boxId: auth.boxId, scopes: auth.scopes, params })
    } catch (e) {
      console.error('[api/v1] handler error:', e)
      return jsonError('internal', 'Something went wrong.', 500)
    }
  }
}
