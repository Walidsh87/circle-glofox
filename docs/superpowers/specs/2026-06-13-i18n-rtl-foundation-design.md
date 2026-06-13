# i18n + RTL foundation + proof slice (#71a) — Design

**Roadmap:** Tier 9 #71 `[GCC]` Arabic RTL admin UI + bilingual member comms — **sub-project 71a** (first of the decomposition).
**Date:** 2026-06-13
**Status:** Approved (design hardened by a 5-agent investigation + adversarial review), ready for writing-plans

## Decomposition (parent #71)

#71 is three independent sub-projects; **members-first** scope (per brainstorming) drops 71b:
- **71a — i18n + RTL foundation + proof slice** ← *this spec*
- **71c — bilingual member comms** (email/SMS/WhatsApp in the member's language) — follow-on
- ~~71b — admin UI Arabic translation~~ — **dropped** (staff stay English)
- Then: roll Arabic out to the remaining member surfaces in focused follow-on plans.

Language is **per-member, opt-in, English by default**. Staff never get a toggle, so the admin stays English with zero translation work.

## Context & key facts (verified)

- No i18n today: `<html lang="en">` hardcoded, no `dir`, no `profiles.language`, no library.
- Design system is RTL-clean: **zero** physical-direction classes on the proof-slice *content* (only decorative, desktop-only brand-panel ornaments in `auth-layout.tsx`). Tailwind **3.4.19** supports logical props natively.
- `IBM_Plex_Sans_Arabic` is available in `next/font/google` (Next 16.2.6) with `subsets:['arabic']` — self-hosted at build, no CSP change.
- `profiles` has **no UPDATE RLS** (writes go via service-role, self-scoped — the #77 `updateOwnProfile` pattern).
- `x-pathname` header is already set by middleware and read in `dashboard/layout.tsx`.

## Architecture

A lightweight **custom typed dictionary** (no library; next-intl would force `app/[locale]/…` routing — a 160-route restructure). Locale is resolved **once per request, server-side, context-aware**, and threaded to `<html lang/dir>`, server `getDictionary()`, and the client `LocaleProvider` so the trees never disagree.

**Why custom:** fits the codebase's pure-lib ethos; `ar: typeof en` gives compile-time key parity.

## Locale resolution — the load-bearing decision

`src/lib/i18n/server.ts` → `getLocale(): Promise<Locale>`, called **once in the root layout**:

```
1. pathname = headers().get('x-pathname') ?? ''
2. if pathname starts with '/embed' → return 'en'        // embeds are out of scope, English-only
3. const cookie = cookies().get('locale')?.value
4. if cookie present → return resolveLocale(cookie)       // fast path (set by the toggle)
5. const { user } = await supabase.auth.getUser()
6. if user → read profiles.language → return resolveLocale(lang)   // authed truth; first-paint correct cross-device
7. return 'en'
```

This single resolution fixes **both criticals**:
- **No embed/admin RTL leak** — `/embed/*` forces `en`; an authed **staff** member resolves to *their own* `profiles.language` (always `'en'` — they have no toggle), so admin never flips. Members resolve to their `'ar'`.
- **First-paint correct, no flash** — resolved in the root layout (not seeded in a child), so `<html lang/dir>`, the dictionary, and the provider all agree on the first response, including a fresh-device Arabic member (step 6). The cookie is only a fast-path optimization the toggle writes; sign-out clears it.

> Cost: steps 5–6 (a `getUser` + PK profile read) run **only when the locale cookie is absent** — first hit per device. After the member toggles once, the cookie short-circuits at step 4. The page guards already read the profile, so this is a bounded, occasional extra read. Documented, acceptable for 71a.

`resolveLocale(raw: string | null | undefined): Locale` is **pure** (`'ar'` → `'ar'`, anything else → `'en'`) and unit-tested.

## Data model — migration 067

```sql
-- migrations/067_member_language.sql
-- Member language preference (#71a). Idempotent. No RLS change:
-- profiles has no UPDATE policy; setLanguage writes via the self-scoped service-role action (#77 pattern).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
```

`language` is plain app-validated `text` (the `'en'|'ar'` set is enforced by `resolveLocale` + `setLanguage`), matching how `season` (mig 066) and `blood_type` are handled — no DB CHECK/enum, which keeps the migration idempotent (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`).

## Files

**`src/lib/i18n/` (pure, under the vitest coverage include `src/lib/**`)**
- `en.ts` — nested typed messages (`{ common, login, schedule }`).
- `ar.ts` — `const ar: typeof en = {…}` (compile-time key parity).
- `index.ts` — `type Locale='en'|'ar'`, `LOCALES`, `resolveLocale(raw)`, `dictionaries`, `getDictionary(locale)`, `type Messages = typeof en`.
- `server.ts` — `getLocale()` (server-only: `next/headers` + supabase). Not unit-tested (I/O); its pure core `resolveLocale` is.

**`src/components/i18n/`**
- `locale-provider.tsx` — `'use client'` `LocaleProvider({locale, messages, children})` + `useT()` / `useLocale()`. **Treats props as authoritative — never re-reads `document.cookie`, never defaults to `'en'` on mount** (that re-derivation is the only real hydration-mismatch vector; `suppressHydrationWarning` must stay theme-only in intent and not paper over a provider desync).
- `language-toggle.tsx` — `'use client'` EN / عربي → calls `setLanguage` then `router.refresh()`.

**`src/app/_actions/set-language.ts`** (shared by public + authed surfaces)
- `setLanguage(locale: Locale)`: validate `locale ∈ LOCALES`; **always** set the `locale` cookie; if `supabase.auth.getUser()` is non-null, also update `profiles.language` via the **service-role client, pinned to `auth.uid()`** (mirrors `updateOwnProfile`). Tolerates the no-session public surface (skips the profile write when anonymous).

**Root `src/app/layout.tsx`** (becomes `async`)
- `const locale = await getLocale()`; `<html lang={locale} dir={locale==='ar'?'rtl':'ltr'} data-theme="dark" suppressHydrationWarning>` — keep `data-theme`, `suppressHydrationWarning`, and the inline `themeInitScript` exactly as-is (theme script never touches `dir/lang`; no collision).
- Add `IBM_Plex_Sans_Arabic` at module scope (`subsets:['arabic']`, `variable:'--font-plex-arabic'`, `weight:['400','500','600','700']`, `display:'swap'`); append `plexArabic.variable` to the `<body>` className.
- Wrap `{children}` in `<LocaleProvider locale={locale} messages={getDictionary(locale)}>`.

**`globals.css`**: `[lang='ar'] body { font-family: var(--font-plex-arabic), …; }`.

**Sign-out action**: clear the `locale` cookie (prevents the next user on a shared device inheriting a stale locale).

## Proof slice (end-to-end bilingual + RTL)

**A. Public gym login** (member/prospect-only, cookie-driven, collision-free):
- `[gymSlug]/page.tsx`, `[gymSlug]/_components/gym-login-form.tsx`, and the shared `components/auth/login-form.tsx` (~15 strings) + `auth-layout.tsx` copy. These are all **pre-auth login surfaces** (also used by `/`), so localizing them is safe — no authed-admin collision.
- Mount `<LanguageToggle>` on the page body.

**B. Member schedule** (`/dashboard/schedule`):
- Server `page.tsx` strings via `getDictionary()`; the 4 client components (`booking-button`, `family-booking-row`, `calendar-sync-card`, `push-card`) via `useT()`.
- **Thread locale into the `Intl.DateTimeFormat` calls** (day/time labels) so dates render Arabic in `ar` mode — `Intl.DateTimeFormat(locale==='ar' ? 'ar' : 'en-GB', …)`. (This is the proof; `ar` yields Arabic month/day names + Arabic-Indic digits — deliberate; `ar-u-nu-latn` is the swap if a gym wants Western digits. Stated, not implicit.)
- Replace the two hardcoded `→` glyphs (`calendar-sync-card.tsx`, `push-card.tsx`) with a neutral separator / Arabic phrasing in the dictionary (the arrow isn't auto-mirrored under RTL).
- Mount `<LanguageToggle>` on the **page body** (a logged-in member route), **not** the shared sidebar footer. Shared routes are safe because translation is **locale-driven at render** — a staff viewer (locale `en`) sees English; the same component renders Arabic only for an `ar` member.

**Out of scope of the proof slice but noted:** decorative `right-*` brand-panel ornaments (desktop-only, no copy) stay physical — cosmetic-only, non-content.

## Testing

- **`src/lib/i18n/index.test.ts`**: `resolveLocale` (`'ar'`/`'en'`/garbage/`null`/`undefined` → correct `Locale`, default `'en'`); `getDictionary` returns the right object per locale; **runtime key-parity** assertion (`en` and `ar` have identical key sets — catches an `as` cast; note the compile-time `typeof` guarantee catches *missing* keys but **not** an English value left untranslated).
- **`setLanguage`** validation (rejects a non-`Locale`).
- QA step (manual): **log in as staff → no language toggle, admin stays LTR/English**; member toggles → schedule + login flip to Arabic/RTL with Arabic font; refresh persists; new device shows the saved language on first paint.

## Out of scope (follow-on)

Remaining member surfaces (members/[memberId] self-view, wod, lifts, skills, shop, feed, committed-club, messages), bilingual comms (71c), admin UI (71b, dropped), gym-level default language, carrying the public-page locale into `/join` account creation (the cookie does **not** auto-set a new profile's language), localizing owner-authored content (WOD/plan names stay as typed).

## File-touch summary

- **New:** `migrations/067_member_language.sql`, `src/lib/i18n/{en,ar,index,server}.ts`, `src/lib/i18n/index.test.ts`, `src/components/i18n/{locale-provider,language-toggle}.tsx`, `src/app/_actions/set-language.ts`
- **Modified:** `src/app/layout.tsx` (async, locale, Arabic font, provider), `globals.css` (Arabic font under `[lang=ar]`), the sign-out action (clear cookie), proof slice A (`[gymSlug]/page.tsx`, `gym-login-form.tsx`, `auth/login-form.tsx`, `auth/auth-layout.tsx`), proof slice B (`schedule/page.tsx` + 4 client components, locale-threaded dates)
