# 71c — Bilingual System-Transactional Comms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Send the six auto-fired member messages (billing reminders, card-failed dunning, waitlist email+push, class-reminder push, new-message push title) in the recipient's `profiles.language`, with RTL for Arabic email. Owner/staff and English members unchanged.

**Architecture:** Extend the dictionary with a `comms.*` namespace (email bodies are HTML templates with a `{button}` placeholder). Add recipient-locale helpers. Thread `locale` through the email/push builders; `getT(locale)` is pure (no request context). `emailShell` gains an RTL hook.

**Tech Stack:** TypeScript, custom i18n (`getT`/`makeT`, `{var}` interpolation — single-pass, replacement text not re-scanned, so `{button}` safely carries HTML), Resend, web-push.

**Source of truth:** spec `…2026-06-13-bilingual-transactional-comms-design.md`. Arabic authored + adversarially reviewed by workflow (placeholder + newline integrity verified); first-pass MSA, native review pending.

**Verification model:** `email.ts`/`push.ts` do I/O and are untested by codebase convention. Gates: `tsc` (dictionary parity via `ar: typeof en`), unit tests for the **pure** new logic (`recipients`, `buildDigestPushes`, `emailShell` RTL), full `vitest run`, `build`, manual smoke. No migration. Run gates separately; never chain into a commit. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: `comms.*` dictionary (en + ar)

**Files:** Modify `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts`.

Append the `comms` key after the existing `profile` block in **both** files (identical key structure; `ar` mirrors `en`).

- [ ] **Step 1: `en.ts`** — add:

```ts
  comms: {
    billing: {
      subject: {
        pre: 'Your {gymName} membership is due {date}',
        due: 'Membership due today — {gymName}',
        overdue: 'Payment overdue — {gymName}',
      },
      body: {
        pre: '<p>Hey {athleteName},</p>\n<p>Just a heads-up — your monthly membership at <strong>{gymName}</strong> is due on <strong>{date}</strong> ({amount}). Drop by the front desk anytime to renew.</p>\n<p>— {gymName}</p>',
        due: '<p>Hi {athleteName},</p>\n<p>Your monthly membership at <strong>{gymName}</strong> is due today ({amount}). Please renew at the front desk or contact us.</p>\n<p>— {gymName}</p>',
        overdue: '<p>Hi {athleteName},</p>\n<p>Your <strong>{gymName}</strong> membership payment is 3 days overdue ({amount}). Your gym check-ins may be blocked until you renew. Please drop by or contact us today.</p>\n<p>— {gymName}</p>',
      },
    },
    cardFailed: {
      subject: {
        retry: "Heads up — {gymName} payment couldn't be processed",
        final: 'Action required — {gymName} payment failed',
      },
      body: {
        retry: "<p>Hi {athleteName},</p>\n<p>We tried to charge {amount} for your <strong>{gymName}</strong> membership but your card was declined (attempt {attemptCount} of {maxRetries}). We'll retry automatically, but updating your card now will speed things up.</p>\n{button}\n<p>— {gymName}</p>",
        final: "<p>Hi {athleteName},</p>\n<p>We tried {attemptCount} times to charge {amount} for your <strong>{gymName}</strong> membership and your card was declined each time. Your account is now <strong>past due</strong>, which means your check-ins may be blocked.</p>\n{button}\n<p>Once you update your card, we'll automatically retry the charge.</p>\n<p>— {gymName}</p>",
      },
      cta: {
        retry: 'Update payment method',
        final: 'Update your card',
      },
    },
    waitlist: {
      subject: 'A spot opened in {className} at {gymName}',
      body: '<p>Hi {athleteName},</p>\n<p>A spot just opened in <strong>{className}</strong> ({classTime}) at {gymName}. Spots go fast — book now:</p>\n{button}\n<p>— {gymName}</p>',
      cta: 'Book now',
    },
    waitlistPush: {
      title: 'A spot opened!',
      body: '{className} {classTime} — book it before someone else does',
    },
    classReminder: {
      title: 'Today at the gym',
      line: '{className} at {time}',
      separator: ', ',
    },
    newMessage: {
      title: 'New message from the gym',
    },
  },
```

- [ ] **Step 2: `ar.ts`** — add the mirror (same keys):

```ts
  comms: {
    billing: {
      subject: {
        pre: 'عضويتك في {gymName} مستحقة في {date}',
        due: 'العضوية مستحقة اليوم — {gymName}',
        overdue: 'دفعة متأخّرة — {gymName}',
      },
      body: {
        pre: '<p>مرحبًا {athleteName}،</p>\n<p>تذكير بسيط — عضويتك الشهرية في <strong>{gymName}</strong> مستحقة في <strong>{date}</strong> ({amount}). مرّ على مكتب الاستقبال في أي وقت للتجديد.</p>\n<p>— {gymName}</p>',
        due: '<p>مرحبًا {athleteName}،</p>\n<p>عضويتك الشهرية في <strong>{gymName}</strong> مستحقة اليوم ({amount}). يُرجى التجديد في مكتب الاستقبال أو التواصل معنا.</p>\n<p>— {gymName}</p>',
        overdue: '<p>مرحبًا {athleteName}،</p>\n<p>دفعة عضويتك في <strong>{gymName}</strong> متأخّرة منذ 3 أيام ({amount}). قد يتم إيقاف تسجيل حضورك في النادي حتى تجدّد العضوية. يُرجى المرور علينا أو التواصل معنا اليوم.</p>\n<p>— {gymName}</p>',
      },
    },
    cardFailed: {
      subject: {
        retry: 'تنبيه — تعذّر إتمام دفعة {gymName}',
        final: 'إجراء مطلوب — فشلت دفعة {gymName}',
      },
      body: {
        retry: '<p>مرحبًا {athleteName}،</p>\n<p>حاولنا تحصيل {amount} مقابل عضويتك في <strong>{gymName}</strong> لكن تم رفض بطاقتك (المحاولة {attemptCount} من {maxRetries}). سنعيد المحاولة تلقائيًا، لكن تحديث بطاقتك الآن سيُسرّع الأمر.</p>\n{button}\n<p>— {gymName}</p>',
        final: '<p>مرحبًا {athleteName}،</p>\n<p>حاولنا {attemptCount} مرات تحصيل {amount} مقابل عضويتك في <strong>{gymName}</strong> وتم رفض بطاقتك في كل مرة. أصبح حسابك الآن <strong>متأخّر السداد</strong>، ما يعني أن تسجيل حضورك قد يكون محظورًا.</p>\n{button}\n<p>بمجرد تحديث بطاقتك، سنعيد محاولة التحصيل تلقائيًا.</p>\n<p>— {gymName}</p>',
      },
      cta: {
        retry: 'تحديث طريقة الدفع',
        final: 'حدّث بطاقتك',
      },
    },
    waitlist: {
      subject: 'توفّر مكان في {className} لدى {gymName}',
      body: '<p>مرحبًا {athleteName}،</p>\n<p>توفّر للتو مكان في <strong>{className}</strong> ({classTime}) لدى {gymName}. الأماكن تنفد بسرعة — احجز الآن:</p>\n{button}\n<p>— {gymName}</p>',
      cta: 'احجز الآن',
    },
    waitlistPush: {
      title: 'توفّر مكان!',
      body: '{className} {classTime} — احجزه قبل أن يسبقك غيرك',
    },
    classReminder: {
      title: 'اليوم في النادي',
      line: '{className} في {time}',
      separator: '، ',
    },
    newMessage: {
      title: 'رسالة جديدة من النادي',
    },
  },
```

- [ ] **Step 3:** `npm run type-check` → PASS (parity). **Step 4:** commit `feat(i18n): comms.* transactional namespace (#71c)`.

**Note:** `{button}` is replaced by `emailButton(...)` HTML at render. The i18n `interpolate` does a single pass and does **not** re-scan replacement text, so the button HTML is inserted verbatim. The `<strong>` emphasis wraps the same interpolated terms in both locales.

---

### Task 2: Recipient-locale helpers

**Files:** Create `src/lib/i18n/recipients.ts`, `src/lib/i18n/recipients.test.ts`.

- [ ] **Step 1: failing test** `recipients.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { loadRecipientLocales, loadRecipientLocalesByEmail } from './recipients'

function svcReturning(rows: unknown[]) {
  return { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: rows }) }) }) } as never
}

describe('loadRecipientLocales (by id)', () => {
  it('maps ids to resolved locales; unknown language → en', async () => {
    const m = await loadRecipientLocales(svcReturning([
      { id: 'a', language: 'ar' }, { id: 'b', language: 'en' }, { id: 'c', language: null },
    ]), ['a', 'b', 'c'])
    expect(m.get('a')).toBe('ar')
    expect(m.get('b')).toBe('en')
    expect(m.get('c')).toBe('en')
  })
  it('empty ids → empty map, no query', async () => {
    const m = await loadRecipientLocales(svcReturning([]), [])
    expect(m.size).toBe(0)
  })
})

describe('loadRecipientLocalesByEmail', () => {
  it('keys by lowercased email', async () => {
    const m = await loadRecipientLocalesByEmail(svcReturning([
      { email: 'A@B.CO', language: 'ar' },
    ]), ['A@B.CO'])
    expect(m.get('a@b.co')).toBe('ar')
  })
})
```

- [ ] **Step 2: run** `npx vitest run src/lib/i18n/recipients.test.ts` → FAIL (module missing).
- [ ] **Step 3: implement** `recipients.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveLocale, type Locale } from './index'

export async function loadRecipientLocales(service: SupabaseClient, ids: string[]): Promise<Map<string, Locale>> {
  const out = new Map<string, Locale>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out
  const { data } = await service.from('profiles').select('id, language').in('id', unique)
  for (const r of (data ?? []) as { id: string; language: string | null }[]) {
    out.set(r.id, resolveLocale(r.language))
  }
  return out
}

export async function loadRecipientLocalesByEmail(service: SupabaseClient, emails: string[]): Promise<Map<string, Locale>> {
  const out = new Map<string, Locale>()
  const unique = [...new Set(emails.filter(Boolean))]
  if (unique.length === 0) return out
  const { data } = await service.from('profiles').select('email, language').in('email', unique)
  for (const r of (data ?? []) as { email: string | null; language: string | null }[]) {
    if (r.email) out.set(r.email.toLowerCase(), resolveLocale(r.language))
  }
  return out
}
```

- [ ] **Step 4:** `npx vitest run src/lib/i18n/recipients.test.ts` → PASS. **Step 5:** `type-check` + `lint`. **Step 6:** commit `feat(i18n): recipient-locale loaders (#71c)`.

---

### Task 3: `emailShell` RTL hook

**Files:** Modify `src/lib/email-shell.ts`, `src/lib/email-shell.test.ts`.

- [ ] **Step 1: extend the test** — add to `email-shell.test.ts`:

```ts
import type { Locale } from './index' // if needed; otherwise pass the string literal
it('renders RTL for Arabic', () => {
  const html = emailShell('<p>مرحبا</p>', 'ar')
  expect(html).toContain('dir="rtl"')
  expect(html).toContain('text-align:right')
})
it('defaults to LTR', () => {
  expect(emailShell('<p>Hi</p>')).toContain('dir="ltr"')
})
```

- [ ] **Step 2: run** → FAIL. **Step 3: implement** — replace `emailShell` in `email-shell.ts`:

```ts
import type { Locale } from '@/lib/i18n'

export function emailShell(inner: string, locale: Locale = 'en'): string {
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const align = locale === 'ar' ? 'right' : 'left'
  return `<!DOCTYPE html>
<html dir="${dir}">
<body style="margin:0;padding:0;background:#F6F4ED">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4ED"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E3DFD2;border-radius:12px"><tr><td style="padding:32px 28px;font-family:${FONT};font-size:15px;line-height:1.6;color:#15150F;direction:${dir};text-align:${align}">
${inner}
</td></tr></table>
</td></tr></table>
</body>
</html>`
}
```

- [ ] **Step 4:** `npx vitest run src/lib/email-shell.test.ts` → PASS. **Step 5:** commit `feat(email): RTL email shell (#71c)`.

---

### Task 4: Email builders take a locale

**Files:** Modify `src/lib/email.ts`.

- [ ] **Step 1: import + widen input types.** Add `import { getT, type Locale, type TFn } from '@/lib/i18n'`. Add `locale: Locale` to `ReminderEmailInput`, `CardFailedEmailInput`, `WaitlistEmailInput`.
- [ ] **Step 2: billing `buildSubject`/`buildBody`** → pull from dictionary (assumes `ReminderStage = 'pre'|'due'|'overdue'`; confirm in `@/lib/billing-reminders` — if literals differ, map to those three keys):

```ts
function buildSubject(t: TFn, stage: ReminderStage, gymName: string, dueDate: string): string {
  return t(`comms.billing.subject.${stage}`, { gymName, date: formatDate(dueDate) })
}

function buildBody(t: TFn, input: ReminderEmailInput): string {
  const amount = `${input.amountAed.toLocaleString()} AED`
  return t(`comms.billing.body.${input.stage}`, {
    athleteName: input.athleteName, gymName: input.gymName, date: formatDate(input.dueDate), amount,
  })
}
```

  And in `sendBillingReminderEmail`, build `const t = getT(input.locale)` then `subject: buildSubject(t, input.stage, input.gymName, input.dueDate)`, `html: emailShell(buildBody(t, input), input.locale)`.

- [ ] **Step 3: `sendCardFailedEmail`** body becomes:

```ts
  const { athleteName, gymName, amountAed, attemptCount, maxRetries, updatePaymentUrl, to, locale } = input
  const t = getT(locale)
  const amount = `${amountAed.toLocaleString()} AED`
  const variant = attemptCount >= maxRetries ? 'final' : 'retry'
  const button = emailButton(t(`comms.cardFailed.cta.${variant}`), updatePaymentUrl)
  const subject = t(`comms.cardFailed.subject.${variant}`, { gymName })
  const body = t(`comms.cardFailed.body.${variant}`, { athleteName, gymName, amount, attemptCount, maxRetries, button })
```

  and `html: emailShell(body, locale)`.

- [ ] **Step 4: `sendWaitlistEmail`** body becomes:

```ts
  const t = getT(input.locale)
  const button = emailButton(t('comms.waitlist.cta'), input.bookUrl)
  const body = t('comms.waitlist.body', { athleteName: input.athleteName, className: input.className, classTime: input.classTime, gymName: input.gymName, button })
  const subject = t('comms.waitlist.subject', { className: input.className, gymName: input.gymName })
```

  and `html: emailShell(body, input.locale)`.

- [ ] **Step 5:** `type-check` (will fail at the call sites that don't yet pass `locale` — Task 6 fixes them; that's expected mid-task, but to keep each commit green, do Task 4 + Task 6 wiring before committing, OR temporarily default `locale` — DO NOT default; instead implement Task 6 in the same commit window). **Practical ordering:** implement Task 4 and Task 6 together, then `type-check`/`lint` green, then commit `feat(i18n): localize transactional emails (#71c)`.

---

### Task 5: `buildDigestPushes` takes per-athlete locale

**Files:** Modify `src/lib/push.ts`, create `src/lib/push.test.ts`.

- [ ] **Step 1: failing test** `push.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildDigestPushes } from './push'

const rows = [{ athlete_id: 'a', starts_at: '2026-06-13T06:00:00Z', class_name: 'CrossFit' }]

describe('buildDigestPushes', () => {
  it('English by default', () => {
    const [p] = buildDigestPushes(rows, 'Asia/Dubai')
    expect(p.payload.title).toBe('Today at the gym')
    expect(p.payload.body).toContain('CrossFit at')
  })
  it('Arabic when locale map says ar', () => {
    const [p] = buildDigestPushes(rows, 'Asia/Dubai', new Map([['a', 'ar']]))
    expect(p.payload.title).toBe('اليوم في النادي')
    expect(p.payload.body).toContain('CrossFit في')
  })
})
```

- [ ] **Step 2: run** → FAIL (3rd arg unsupported / English only). **Step 3: implement** — add import `import { getT, type Locale } from '@/lib/i18n'`; change signature + body:

```ts
export function buildDigestPushes(rows: DigestRow[], timeZone: string, localeByAthlete?: Map<string, Locale>): { athleteId: string; payload: PushPayload }[] {
  const byAthlete = new Map<string, DigestRow[]>()
  for (const r of rows) {
    const arr = byAthlete.get(r.athlete_id) ?? []
    arr.push(r)
    byAthlete.set(r.athlete_id, arr)
  }
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
  return [...byAthlete.entries()].map(([athleteId, list]) => {
    const t = getT(localeByAthlete?.get(athleteId) ?? 'en')
    const sorted = [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const parts = sorted.map((r) => t('comms.classReminder.line', { className: r.class_name, time: fmt.format(new Date(r.starts_at)) }))
    return { athleteId, payload: { title: t('comms.classReminder.title'), body: parts.join(t('comms.classReminder.separator')), url: '/dashboard/schedule' } }
  })
}
```

- [ ] **Step 4:** `npx vitest run src/lib/push.test.ts` → PASS. **Step 5:** `type-check` + `lint`. **Step 6:** commit `feat(push): localize class-reminder digest (#71c)`.

---

### Task 6: Wire the five send sites

**Files:** Modify `src/app/api/cron/billing-reminders/route.ts`, `src/app/api/cron/class-reminders/route.ts`, `src/app/dashboard/schedule/_actions/cancel-booking.ts`, `src/app/dashboard/inbox/_actions/send-message.ts`, `src/app/api/webhooks/stripe/route.ts`. (Do Task 4's email edits together with this so type-check stays green.)

- [ ] **Step 1: billing cron** — `import { loadRecipientLocalesByEmail } from '@/lib/i18n/recipients'`. After the rows are loaded, before the loop: `const localeMap = await loadRecipientLocalesByEmail(<serviceClient>, rows.map((r) => r.athlete_email))`. In the `sendBillingReminderEmail({...})` call add `locale: localeMap.get(r.athlete_email.toLowerCase()) ?? 'en'`. (Use the cron's existing service/supabase client var.)
- [ ] **Step 2: class-reminders cron** — `import { loadRecipientLocales } from '@/lib/i18n/recipients'`. Inside the per-box loop, after `athleteIds` is known (the `push_subscriptions` step): `const localeMap = await loadRecipientLocales(service, athleteIds)`; change `buildDigestPushes(filtered, tz)` → `buildDigestPushes(filtered, tz, localeMap)`.
- [ ] **Step 3: cancel-booking** — `import { resolveLocale } from '@/lib/i18n'` + `import { getT } from '@/lib/i18n'`. Widen the athlete fetch `profiles.select('email, full_name')` → `select('email, full_name, language')`. Before the sends: `const locale = resolveLocale(athlete?.language)`. Pass `locale` to `sendWaitlistEmail({ ..., locale })`. Replace the inline push payload with `const t = getT(locale)` then `{ title: t('comms.waitlistPush.title'), body: t('comms.waitlistPush.body', { className: tmpl?.name ?? 'Your class', classTime }), url: '/dashboard/schedule' }`.
- [ ] **Step 4: send-message** — `import { getT, resolveLocale } from '@/lib/i18n'`. Before the staff-reply `sendPushTo` (inside `if (isStaff)`): `const { data: rp } = await service.from('profiles').select('language').eq('id', targetMemberId).maybeSingle(); const t = getT(resolveLocale(rp?.language))`. Change the payload `title: 'New message from the gym'` → `title: t('comms.newMessage.title')`. Body (`messagePreview(text)`) unchanged.
- [ ] **Step 5: stripe webhook (handlePaymentFailed)** — `import { resolveLocale } from '@/lib/i18n'`. Widen the membership select's nested projection `profiles:athlete_id(full_name, email)` → `profiles:athlete_id(full_name, email, language)`. In the `sendCardFailedEmail({...})` call add `locale: resolveLocale((membership as { profiles?: { language?: string | null } | null }).profiles?.language)`.
- [ ] **Step 6:** `npm run type-check` (PASS — all builder call sites now pass `locale`), `npm run lint` (PASS).
- [ ] **Step 7:** commit `feat(i18n): localize transactional emails + push at send sites (#71c)` (folds in Task 4's email.ts edits).

---

### Task 7: Full gate + manual smoke

- [ ] `npm run type-check` (0 errors) · `npm run lint` (clean) · `npx vitest run` (**full** suite green; if any test constructs `ReminderEmailInput`/`CardFailedEmailInput`/`WaitlistEmailInput` it now needs `locale` — fix it) · `npm run build`.
- [ ] **Manual check (record):** with `locale='ar'`, a rendered billing/card-failed/waitlist email is Arabic + `dir="rtl"`; the digest/waitlist/new-message push titles are Arabic. With `'en'` everything is byte-unchanged. Auth login-code email still English (expected).
- [ ] Push (auto-deploys). Update roadmap (`GymGlofox.md` #71/#71c) + memory `project-direction.md`.

---

## Self-review notes
- **Spec coverage:** dictionary (T1), helpers (T2), email RTL (T3), email builders (T4), push (T5), wiring all 5 sites (T6), gate (T7). Auth emails + staff campaigns excluded per spec.
- **Type consistency:** `locale: Locale` added to all three email input types and passed at every call site (T6); `buildDigestPushes` 3rd arg optional (back-compat); `{button}` interpolation relies on single-pass `interpolate`.
- **Risk:** `ReminderStage` literal names must equal `pre|due|overdue` (T4 Step 2 flags the confirm). Email builders aren't unit-tested (codebase convention) — covered by parity + manual smoke.
