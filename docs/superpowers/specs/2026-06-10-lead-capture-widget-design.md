# Lead-capture Widget (#45) — Design

**Date:** 2026-06-10
**Roadmap:** v2 Tier 5 #45 `[G-gap]` — Embeddable lead-capture widget
**Status:** Approved by owner (sections approved in session)

## Goal

An embeddable public form a gym puts on its own website that creates a CRM lead in the gym's account.

## Scope decisions (user-approved)

- **iframe embed of a hosted page.** We host `/embed/lead/[gymSlug]`; the gym pastes a one-line `<iframe>`. Style-isolated, no script injection, also works as a standalone shareable link. (No JS-snippet embed.)
- **Fields:** Name (required), Email, Phone (at least one of email/phone required), Message (optional → `notes`). Hidden **honeypot** field deters bots. No third-party captcha.
- **Writes the existing `leads` table** — no schema change. `source = 'widget'`; `status` omitted (DB default applies, matching `addLead`).
- Submitter is anonymous → insert via **service-role** client with whitelisted fields (RLS owner-write can't apply to an anon submitter).

## Architecture & routes

Mirrors the existing public `/join/[gymSlug]` pattern (service-role lookup by slug).

- **Public embed page** — `src/app/embed/lead/[gymSlug]/page.tsx`. Unauthenticated, minimal chrome (no dashboard shell), renders cleanly in a narrow iframe. Looks up the box by `slug` via service role; `notFound()` if unknown. Shows gym logo (if set) + name + the form.
- **Submit action** — `src/app/embed/lead/[gymSlug]/_actions/submit-lead.ts`, service-role.
- **Owner snippet** — a card on `/dashboard/settings` with a copy-to-clipboard `<iframe>` snippet, shown when the gym has a slug.

### Framing headers

Today `next.config.mjs` sets `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` on `/(.*)` — both block iframing. Refactor `headers()` into two rules:
- `source: '/((?!embed).*)'` → the current strict headers (unchanged behavior for the whole app).
- `source: '/embed/:path*'` → same headers **except** `X-Frame-Options` omitted and CSP `frame-ancestors *` (so any gym site can embed the public form).

Only `/embed/*` becomes framable; the rest of the app stays `DENY`.

## Data & validation

Insert into `leads`: `box_id`, `full_name`, `email`, `phone`, `notes`, `source: 'widget'`.

**Pure validation** (`src/lib/lead-capture.ts`, unit-tested):
- `validateLeadSubmission(name: string, email: string, phone: string): string | null`
  - name required, 1–120 chars
  - at least one of email/phone non-empty
  - if email given, must match a basic email regex
  - phone ≤ 40 chars; (message length checked in the action: notes ≤ 1000)
  - returns a human-readable message or `null`

## Submit action — `submitLead`

Signature: `submitLead(gymSlug: string, input: { name: string; email: string; phone: string; message: string; company: string }): Promise<{ ok: boolean; error?: string }>` (`company` is the honeypot).

1. **Honeypot first:** if `company` is non-empty, return `{ ok: true }` *without inserting* (silently absorb the bot).
2. Resolve box by `slug` via service role → `box_id`; unknown slug → `{ ok: false, error: 'This form is not available.' }`.
3. `validateLeadSubmission(name, email, phone)`; on failure return `{ ok: false, error }`. Also reject `message` > 1000 chars.
4. Insert the lead via service role: `{ box_id, full_name: name.trim(), email: email.trim().toLowerCase() || null, phone: phone.trim() || null, notes: message.trim() || null, source: 'widget' }`.
5. Return `{ ok: true }` (or `{ ok: false, error }` on DB error).

## UI

**Embed page** — standalone centered card: gym logo + name + "Get started" line + `<LeadForm gymSlug=…>`.

**`<LeadForm>`** (client) — Name, Email, Phone, Message (textarea), a visually-hidden honeypot `company` input (off-screen, `tabIndex=-1`, `autoComplete="off"`), Submit. `useTransition`; on `{ ok: true }` swap to a thank-you panel; on error show the message inline. Self-contained CSS-var styling, mobile-friendly.

**Owner snippet card** — on `/dashboard/settings`, a read-only snippet:
`<iframe src="${NEXT_PUBLIC_APP_URL}/embed/lead/${slug}" width="100%" height="520" style="border:0" title="…"></iframe>` + copy button. Shown only when slug exists.

## Testing

- Unit: `validateLeadSubmission` — name required; needs email or phone; email format; length caps.
- Integration (`makeSupabaseMock`, service-role mocked): `submitLead` — honeypot filled → `ok` and no insert; unknown slug → error; valid → inserts with `source: 'widget'` + resolved `box_id`; invalid input → typed error, no insert.

## Out of scope

- JS-snippet embed, reCAPTCHA, per-IP rate limiting (honeypot only this round)
- Custom field configuration per gym
- Auto-notify staff / auto-enroll on new lead — the lead simply appears in the lifecycle board (#38) and member directory; acting on it is #47's job
