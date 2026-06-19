# Public REST API + outbound webhooks (#65) — design

**Status:** Phase 1 (read-only API) shipped. Phases 2–3 outlined.
**Plan:** see the approved plan; this records the durable decisions.

## Problem
No first-class public API exists. Integrations (Zapier, BI, the #21 mobile app) need read access to a gym's data, key-authenticated and tenant-isolated, plus (later) write access and outbound webhooks.

## Phase 1 (shipped) — read-only API
- **Auth:** API keys `ck_live_<32B base64url>`, stored as `sha256(API_KEY_PEPPER || plaintext)` (peppered → a DB-only leak can't forge a lookup; full-entropy key → no slow KDF needed). Plaintext shown once; `key_prefix` for display; revoke via `revoked_at` (checked every request). `api_keys` is service-role-only RLS (no policies), migration 078.
- **Box-scoping:** service-role client + explicit `.eq('box_id', boxId)`, where `boxId` comes ONLY from the key (never the request). Centralized in `withApiKey()` so routes can't forget it. Cross-tenant id → 404.
- **Scopes:** resource read/write split; `members:pii` explicitly gates member email/phone. The 7 columns locked down by migration 071 are never serialized.
- **PII safety = structural:** allow-list serializers (`src/lib/api/serializers.ts`), never `select('*')`; the same serializers will back webhook payloads.
- **Pagination:** opaque keyset cursor on `(orderCol, id)`, `{ data, next_cursor }`, default 50 / max 100.
- **Rate limit:** per-key Upstash bucket `api:${keyId}` (600/min), fail-open, 429 + `Retry-After`.
- **Docs:** OpenAPI 3.1 at `/api/v1/openapi.json`; `docs/api/overview.md`.
- **Config:** `API_KEY_PEPPER` (optional env; absent → API inert, consistent with other feature-gated secrets). ⚙️ migration 078 applied by hand in Supabase; CI `rls-isolation` replays it + asserts `api_keys` isn't client-readable.

## Key files
`src/lib/api/{api-key,authenticate,with-api-key,respond,cursor,serializers,openapi}.ts`; `src/app/api/v1/**`; `migrations/078_api_keys.sql`; Settings `_components/api-keys-card.tsx` + `_actions/{create,revoke}-api-key.ts`; `src/lib/audit.ts` (`api.key_issued`/`api.key_revoked`); `src/lib/rate-limit.ts` (`checkApiRateLimit`).

## Phase 2 (outlined) — write API
`api_idempotency_keys` (migration 080), `Idempotency-Key` header (`claimEvent`-style replay; 409 on key-reuse-different-body). Extract `book-class`/`add-lead` cores so action + API share one validated path. `POST /api/v1/{bookings,leads}` with `:write` scopes.

## Phase 3 (outlined) — outbound webhooks
`webhook_subscriptions` + `webhook_deliveries` (migration 079). `emitWebhook(service, boxId, type, payload)` (never throws; enqueues a delivery per matching sub; reuses serializers) called from booking/member/payment/membership/lead/score/invoice sites. Delivery cron `/api/cron/webhook-deliveries` (HMAC-SHA256 `t=…,v1=…` signing like portal-token; exponential backoff to 8 attempts → dead-letter). **SSRF validator** (https-only, block private/metadata ranges, re-checked per delivery). Webhooks Settings card + `docs/api/webhooks.md` (subscriber verification recipe).

## Risks / decisions
Multi-tenant isolation is the top risk → boxId only from the key, every query box-filtered, `rls-isolation` proves `api_keys` is service-role-only, route tests prove box-scoping + PII gating. Key leakage → peppered hash + revoke + audit. Webhook SSRF (Phase 3) → dedicated URL validator. Versioning → URI `/api/v1`.
