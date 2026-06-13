# 71c — Bilingual System-Transactional Comms — Design

**Date:** 2026-06-13
**Builds on:** #71a i18n foundation + the member-surface rollout (`…member-arabic-surface-rollout*`).
**Tier 9 / #71c** — members-first Arabic, comms half. Owner/staff unaffected.

## Problem

`profiles.language` (mig 067) is stored but **never read at any send site** — every member message goes out English. The i18n functions (`getT(locale)`, `getDictionary`, `makeT`, `resolveLocale`) are pure and callable server-side with no request context, so the fix is mechanical: fetch the recipient's language → render localized copy.

This pass localizes the **system-transactional** messages — the ones the app fires automatically and the member can't influence, which are entirely our code. Staff-composed campaigns, automations/sequences, SMS, WhatsApp, and Supabase auth emails are explicitly out (see below).

## Scope — the six messages

| Message | Channel | Builder | Recipient locale source |
|---|---|---|---|
| Billing reminder (pre/due/overdue) | email | `sendBillingReminderEmail` (`buildSubject`/`buildBody`) | billing cron — **batch by email** (RPC has no `athlete_id`/`language`) |
| Card-failed dunning (retry/final) | email | `sendCardFailedEmail` | Stripe webhook — widen nested `profiles:athlete_id(...)` select |
| Waitlist spot opened | email | `sendWaitlistEmail` | `cancel-booking.ts` — widen `profiles.select('email,full_name')` |
| Waitlist spot opened | push | inline payload in `cancel-booking.ts` | same single fetch |
| Class-reminder morning digest | push | `buildDigestPushes` | class-reminders cron — **batch by id** (already per-gym) |
| "New message from the gym" (push **title** only) | push | inline payload in `inbox/send-message.ts` | add single `profiles.select('language')` for `targetMemberId` |

## Architecture

### 1. Recipient-locale helpers — `src/lib/i18n/recipients.ts` (new)
```ts
loadRecipientLocales(service, ids: string[]): Promise<Map<string, Locale>>          // by profile id
loadRecipientLocalesByEmail(service, emails: string[]): Promise<Map<string, Locale>> // key = lowercased email
```
Each does ONE `profiles.select('id|email, language').in(...)` query and maps via `resolveLocale`. Missing rows / nulls → `'en'`. Single-recipient sites just widen their existing select and call `resolveLocale(row.language)` — no extra query.

### 2. Dictionary — `comms.*` namespace in `en.ts`/`ar.ts`
First-pass MSA (authored + adversarially reviewed by a translation workflow, like the rollout). Keys (interpolation in braces preserved exactly):
- `comms.billing.subject.{pre,due,overdue}`, `comms.billing.body.{pre,due,overdue}`
- `comms.cardFailed.subject.{retry,final}`, `comms.cardFailed.body.{retry,final}`, `comms.cardFailed.cta.{retry,final}`
- `comms.waitlist.{subject,body,cta}`
- `comms.waitlistPush.{title,body}`
- `comms.classReminder.{title,line,separator}` — `line` = `"{className} at {time}"` (the **"at"** connector is translatable; class names/times are data), `separator` = `", "` → `"، "`
- `comms.newMessage.title`

Parity is the `tsc` gate (`ar: typeof en`). Amounts stay `AED`, Western digits; dates keep their current formatting (no locale date reformat this pass — noted, avoids scope creep).

### 3. Email RTL — `src/lib/email-shell.ts`
`emailShell(inner: string)` gains an optional `locale: Locale` (default `'en'`); when `'ar'` it sets `dir="rtl"` + `text-align:right` on the content `<td>`. Builders pass the recipient locale through. `emailButton` is direction-agnostic (centered). `email-shell.test.ts` exists → add an RTL assertion.

### 4. Builders take a locale
- `email.ts`: `sendBillingReminderEmail` / `sendCardFailedEmail` / `sendWaitlistEmail` (and internal `buildSubject`/`buildBody`) gain `locale: Locale`; English literals move to `getT(locale)('comms.…')`; `emailShell(body, locale)`.
- `push.ts`: `buildDigestPushes(rows, timeZone, localeByAthlete: Map<string, Locale>)` — per-athlete `t` picks title/line/separator. The waitlist push and "New message" push titles are built **inline at their call sites**, so those get localized there (locale already in hand).

### 5. Wire the send sites
- **billing-reminders cron:** after loading rows, `loadRecipientLocalesByEmail(service, rows.map(r => r.athlete_email))` → look up per row → pass `locale` into `sendBillingReminderEmail`.
- **class-reminders cron:** per box, after the `push_subscriptions` fetch, `loadRecipientLocales(service, athleteIds)` → pass the Map into `buildDigestPushes`.
- **cancel-booking.ts:** widen `profiles.select('email, full_name')` → `+ language`; pass `resolveLocale(athlete.language)` to `sendWaitlistEmail` and into the inline push payload (`comms.waitlistPush.*`).
- **inbox/send-message.ts:** add `service.from('profiles').select('language').eq('id', targetMemberId)` before the push; localize the title via `comms.newMessage.title`. Body stays the staff's free text.
- **stripe/route.ts (handlePaymentFailed):** widen the nested select to `profiles:athlete_id(full_name, email, language)`; pass `resolveLocale(...)` into `sendCardFailedEmail`.

## Out of scope (documented, not silent)
- Staff campaigns (broadcasts/SMS/WhatsApp), automations (#37), sequences (#44) — your "system transactional only" choice; they're staff-authored and need dual-compose UI + Arabic authoring.
- SMS / WhatsApp transactional — none exist except staff campaigns (above); WhatsApp templates are Meta-language-locked per `contentSid` (Twilio-console ops, not code).
- **Supabase auth OTP / login-code / recovery emails — vendor boundary.** Global templates in the Supabase dashboard; not per-recipient localizable in our code. *Optional manual ops:* the owner can set a bilingual template in Supabase → Auth → Email Templates. Noted; I can't do it from code.

## Testing
- `email.ts`/`push.ts` builders are pure → add `'ar'`-locale assertions (correct Arabic strings + `dir="rtl"` present) alongside the existing English ones.
- `recipients.ts` helpers get unit tests (id-map, email-map lowercasing, null→`'en'`).
- Dictionary parity = `tsc`. Then full `vitest run` + `build`, run separately.
- No migration; no DB schema change.

## Verification checklist
- [ ] `type-check`, `lint`, full `vitest run`, `build` — green, separate.
- [ ] An `ar` member: billing/card-failed/waitlist emails render Arabic + `dir="rtl"`; waitlist + class-reminder + new-message pushes render Arabic titles.
- [ ] An `en` member (and every staff/owner) is byte-unchanged.
- [ ] Auth login-code email still English (expected — vendor boundary).
