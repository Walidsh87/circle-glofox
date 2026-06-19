# Circle Fitness Webhooks

Get a signed HTTP `POST` to your own endpoint whenever something happens in your gym — so your integrations stay in sync without polling the [REST API](./overview.md).

Owners manage subscriptions in **Dashboard → Settings → Webhooks**: add an HTTPS endpoint URL, tick the events you care about, and copy the **signing secret** (shown once at creation — store it safely; it can't be re-read). Delete a subscription anytime; deliveries stop immediately.

## Events
Subscribe to any of:

| Event | Fires when |
|---|---|
| `booking.created` | A member books a class |
| `booking.cancelled` | A booking is cancelled |
| `member.created` | A member is added |
| `membership.created` | A membership is started |
| `membership.updated` | A membership changes (plan, freeze, cancel, …) |
| `payment.succeeded` | A payment is captured |
| `payment.failed` | A payment fails |
| `lead.created` | A new lead is captured |
| `workout_score.logged` | An athlete logs a score |
| `invoice.created` | An invoice is issued |

## Payload envelope
Every delivery is a JSON body with the same shape:

```json
{
  "id": "8f3b…",          // unique event id (also in the Circle-Webhook-Id header)
  "type": "booking.created",
  "created": 1718841600,   // unix seconds
  "data": { … }            // the event-specific object
}
```

## Headers
| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Circle-Webhook-Id` | The event id — use it to **dedupe** (see below) |
| `Circle-Webhook-Signature` | `t=<unix-seconds>,v1=<hex>` — HMAC of the timestamp + body |

## Verifying the signature
The `v1` value is `HMAC_SHA256(secret, "<t>.<rawBody>")` in lowercase hex, where `<t>` is the `t=` value from the same header and `<rawBody>` is the **exact** request body bytes (verify before JSON-parsing).

To verify a delivery:

1. Parse `t` and `v1` from `Circle-Webhook-Signature`.
2. Recompute `HMAC_SHA256(secret, \`${t}.${rawBody}\`)`.
3. Compare to `v1` with a **constant-time** comparison.
4. Reject if `|now − t| > 5 minutes` (replay protection).

### Node.js example
```js
import crypto from 'crypto'

function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')))
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false // > 5 min → reject

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex')

  const a = Buffer.from(expected)
  const b = Buffer.from(parts.v1 ?? '')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
```

## Delivery semantics
- **At-least-once.** A delivery is retried with backoff until your endpoint returns `2xx` or the attempts are exhausted. The same event **can** arrive more than once.
- **Dedupe on `Circle-Webhook-Id`.** Treat it as the idempotency key — record processed ids and ignore repeats.
- **Respond fast with `2xx`.** Acknowledge, then process asynchronously. Any non-`2xx` (or a timeout) is treated as a failure and retried.
- **Order is not guaranteed.** Don't assume events arrive in the order they occurred; reconcile against the [REST API](./overview.md) when ordering matters.
