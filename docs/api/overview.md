# Circle Fitness Public API (v1)

Read access to a gym's members, classes, bookings, memberships and packages.
Machine-readable contract: **`GET /api/v1/openapi.json`** (OpenAPI 3.1).

## Authentication
Every request needs an API key, issued by an owner in **Dashboard → Settings → API keys**. The full key (`ck_live_…`) is shown **once** at creation — store it safely; only a hash is kept server-side. Send it as a bearer token:

```
Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A request is **always scoped to the gym that owns the key** — you can only ever read your own gym's data. Revoke a key anytime in Settings; it stops working immediately.

### Scopes
A key carries one or more scopes; each endpoint requires a specific one:

| Scope | Grants |
|---|---|
| `members:read` | list/read members |
| `members:pii` | include member `email` + `phone` (otherwise omitted) |
| `classes:read` | list/read class instances |
| `bookings:read` | list bookings |
| `memberships:read` | list memberships |
| `packages:read` | list the package catalog |

> Government-ID / medical fields (Emirates ID, blood type, allergies, DOB, emergency contacts) are **never** exposed by the API, regardless of scope.

## Endpoints
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/api/v1/members` | `members:read` | `?limit&cursor` |
| GET | `/api/v1/members/{id}` | `members:read` | |
| GET | `/api/v1/classes` | `classes:read` | `?from&to` (ISO) window |
| GET | `/api/v1/classes/{id}` | `classes:read` | |
| GET | `/api/v1/bookings` | `bookings:read` | `?class_id&member_id` |
| GET | `/api/v1/memberships` | `memberships:read` | `?member_id` |
| GET | `/api/v1/packages` | `packages:read` | |
| POST | `/api/v1/bookings` | `bookings:write` | body `{ class_instance_id, member_id }` |
| POST | `/api/v1/leads` | `leads:write` | body `{ full_name, email?, phone?, source?, notes? }` |

## Writes & idempotency
`POST` requests accept an optional **`Idempotency-Key`** header. A retry with the same key replays the original response (so a network retry never double-books or double-creates); the same key reused with a *different* body returns **409**. A booking that needs an active membership/credits, or into a full/closed class, returns **422**; an already-booked member returns **409**.

## Webhooks
Subscribe to events (`booking.created`, `booking.cancelled`, `member.created`, `lead.created`, `payment.*`, …) in **Settings → Webhooks**. Deliveries are signed (`Circle-Webhook-Signature: t=…,v1=…`) and retried with exponential backoff. See [webhooks.md](./webhooks.md) for the payload shape + signature verification.

## Pagination
List endpoints return:
```json
{ "data": [ … ], "next_cursor": "b2Zmc2V0…" }
```
Pass `next_cursor` back as `?cursor=` for the next page; `next_cursor` is `null` on the last page. `?limit` defaults to 50, max 100. Cursors are keyset-based (stable under concurrent writes) — treat them as opaque.

## Errors
Non-2xx responses are always:
```json
{ "error": { "code": "forbidden", "message": "This API key is missing the \"members:read\" scope." } }
```
Codes: `unauthorized` (401), `forbidden` (403, wrong scope), `not_found` (404), `validation_error` (400, e.g. bad cursor), `rate_limited` (429, see `Retry-After`), `internal` (500). A cross-gym id returns **404**, never 403.

## Rate limits
Per key. On 429, honour the `Retry-After` header (seconds).

## Versioning
The API is versioned in the path (`/api/v1`). Additive changes stay in v1; breaking changes ship under a new version.
