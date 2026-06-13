# i18n + RTL Foundation + Proof Slice (#71a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a custom i18n + RTL stack (typed dictionary, context-aware locale, Arabic font, members-only toggle) and prove it end-to-end on the public gym login + the member schedule.

**Architecture:** Locale resolved once per request in the root layout via context-aware `getLocale()` (`/embed/*`→`en`, authed→own `profiles.language`, anon→cookie), threaded to `<html lang/dir>`, server `getT()`, and a client `LocaleProvider`. Pure logic lives in `src/lib/i18n/` (under the vitest coverage include). `setLanguage` writes the cookie always + the profile via the self-scoped service role.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind 3.4 (logical props), `next/font/google` IBM Plex Sans Arabic, Vitest.

Spec: `docs/superpowers/specs/2026-06-13-i18n-rtl-foundation-design.md`

> **Translation note:** the Arabic below is first-pass Modern Standard Arabic for the proof slice; recommend a native review before the broader member-surface rollout.

---

## Task 1: Migration 067 + i18n core (test-first)

**Files:**
- Create: `migrations/067_member_language.sql`
- Create: `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts`, `src/lib/i18n/index.ts`
- Test: `src/lib/i18n/index.test.ts`

- [ ] **Step 1: Write the migration**

`migrations/067_member_language.sql`:
```sql
-- migrations/067_member_language.sql
-- Member language preference (#71a). Idempotent. No RLS change:
-- profiles has no UPDATE policy; setLanguage writes via the self-scoped service-role action (#77 pattern).
-- 'language' is app-validated text ('en'|'ar') like season (066) / blood_type — no DB CHECK (keeps it idempotent).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
```

- [ ] **Step 2: Write the failing test**

`src/lib/i18n/index.test.ts`:
```ts
import { resolveLocale, getDictionary, getT, LOCALES } from '@/lib/i18n'
import { en } from '@/lib/i18n/en'
import { ar } from '@/lib/i18n/ar'

test('resolveLocale normalizes to a valid Locale, default en', () => {
  expect(resolveLocale('ar')).toBe('ar')
  expect(resolveLocale('en')).toBe('en')
  expect(resolveLocale('fr')).toBe('en')
  expect(resolveLocale(null)).toBe('en')
  expect(resolveLocale(undefined)).toBe('en')
  expect(resolveLocale('')).toBe('en')
})

test('LOCALES is exactly en + ar', () => expect([...LOCALES]).toEqual(['en', 'ar']))

test('getDictionary returns the matching dictionary', () => {
  expect(getDictionary('en')).toBe(en)
  expect(getDictionary('ar')).toBe(ar)
})

// Runtime parity guard: TS `ar: typeof en` catches MISSING keys; this catches a
// stray cast and confirms identical key sets (it does NOT catch an English value
// left untranslated — that needs human review).
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}
test('en and ar have identical key sets', () =>
  expect(keyPaths(ar).sort()).toEqual(keyPaths(en).sort()))

test('getT looks up dot-paths and interpolates', () => {
  const t = getT('en')
  expect(t('schedule.title')).toBe('Book a Class')
  expect(t('schedule.whosComing', { n: 3 })).toBe("Who's coming (3)")
  expect(t('login.newToGym', { gym: 'Circle Fitness' })).toBe('New to Circle Fitness?')
  expect(t('does.not.exist')).toBe('does.not.exist') // missing key → returns the key
})

test('getT(ar) returns Arabic', () => expect(getT('ar')('schedule.title')).toBe('احجز حصة'))
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/i18n/index.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/i18n"`.

- [ ] **Step 4: Implement `en.ts`**

`src/lib/i18n/en.ts`:
```ts
export const en = {
  lang: { label: 'Language', en: 'English', ar: 'العربية' },
  login: {
    brandEyebrow: 'Member Portal',
    brandDescription: 'Book classes, track your WODs, and manage your membership — all in one place.',
    poweredBy: 'Powered by Circle',
    newToGym: 'New to {gym}?',
    createAccountHint: 'Sign in with a code to create your account',
    eyebrow: 'Sign in',
    headline1: 'The best hour',
    headline2: 'of your day.',
    passwordSubtitle: 'Sign in with your email and password.',
    codeSentTo: 'We sent a 6-digit code to {email}.',
    codeSubtitle: "Enter your email and we'll send a 6-digit sign-in code.",
    emailLabel: 'Email',
    passwordLabel: 'Password',
    codeLabel: '6-digit code',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    sendCode: 'Send code',
    sending: 'Sending…',
    verifying: 'Verifying…',
    differentEmail: 'Use a different email',
    useCodeInstead: 'Sign in with a code instead',
    usePasswordInstead: 'Use a password instead',
    footerPrivacy: 'Privacy',
    footerTerms: 'Terms',
    livePlatform: 'Live platform',
    copyright: '© Circle · GCC',
  },
  schedule: {
    title: 'Book a Class',
    ramadanBadge: 'Ramadan timetable',
    noCoach: 'No coach',
    empty: 'No upcoming classes. Generate instances from the Class Schedule page.',
    whosComing: "Who's coming ({n})",
    book: 'Book',
    cancel: 'Cancel',
    joinWaitlist: 'Join waitlist',
    leave: 'Leave',
    onWaitlist: 'On waitlist · #{n}',
    needCredit: 'Need a class credit — buy a pack',
    lateCancel: 'Late cancel — your class credit wasn’t refunded.',
    familyNeedsCredit: '{name} needs a class credit.',
    memberBook: '{name}: Book',
    memberCancel: '{name}: Cancel',
  },
}
// NOTE: no `as const` — that would make typeof en use literal string types
// (e.g. title: 'Book a Class'), and `const ar: typeof en` would then reject the
// Arabic values. Plain inference widens leaves to `string`, keeping key parity
// enforced while allowing different values per locale.
```

- [ ] **Step 5: Implement `ar.ts`**

`src/lib/i18n/ar.ts`:
```ts
import { en } from './en'

export const ar: typeof en = {
  lang: { label: 'اللغة', en: 'English', ar: 'العربية' },
  login: {
    brandEyebrow: 'بوابة الأعضاء',
    brandDescription: 'احجز الحصص، وتابع تمارينك، وأدِر اشتراكك — كل ذلك في مكان واحد.',
    poweredBy: 'مُشغَّل بواسطة Circle',
    newToGym: 'جديد في {gym}؟',
    createAccountHint: 'سجّل الدخول برمز لإنشاء حسابك',
    eyebrow: 'تسجيل الدخول',
    headline1: 'أفضل ساعة',
    headline2: 'في يومك.',
    passwordSubtitle: 'سجّل الدخول ببريدك الإلكتروني وكلمة المرور.',
    codeSentTo: 'أرسلنا رمزًا من 6 أرقام إلى {email}.',
    codeSubtitle: 'أدخل بريدك الإلكتروني وسنرسل لك رمز دخول من 6 أرقام.',
    emailLabel: 'البريد الإلكتروني',
    passwordLabel: 'كلمة المرور',
    codeLabel: 'رمز من 6 أرقام',
    signIn: 'تسجيل الدخول',
    signingIn: 'جارٍ تسجيل الدخول…',
    sendCode: 'إرسال الرمز',
    sending: 'جارٍ الإرسال…',
    verifying: 'جارٍ التحقق…',
    differentEmail: 'استخدام بريد إلكتروني آخر',
    useCodeInstead: 'سجّل الدخول برمز بدلاً من ذلك',
    usePasswordInstead: 'استخدام كلمة المرور بدلاً من ذلك',
    footerPrivacy: 'الخصوصية',
    footerTerms: 'الشروط',
    livePlatform: 'منصة حيّة',
    copyright: '© Circle · GCC',
  },
  schedule: {
    title: 'احجز حصة',
    ramadanBadge: 'جدول رمضان',
    noCoach: 'بدون مدرب',
    empty: 'لا توجد حصص قادمة. يمكن إنشاء الحصص من صفحة جدول الحصص.',
    whosComing: 'مَن سيحضر ({n})',
    book: 'حجز',
    cancel: 'إلغاء',
    joinWaitlist: 'الانضمام لقائمة الانتظار',
    leave: 'مغادرة',
    onWaitlist: 'في قائمة الانتظار · #{n}',
    needCredit: 'تحتاج إلى رصيد حصة — اشترِ باقة',
    lateCancel: 'إلغاء متأخر — لم يُسترد رصيد حصتك.',
    familyNeedsCredit: 'يحتاج {name} إلى رصيد حصة.',
    memberBook: '{name}: حجز',
    memberCancel: '{name}: إلغاء',
  },
}
```

- [ ] **Step 6: Implement `index.ts`**

`src/lib/i18n/index.ts`:
```ts
import { en } from './en'
import { ar } from './ar'

export const LOCALES = ['en', 'ar'] as const
export type Locale = (typeof LOCALES)[number]
export type Messages = typeof en

const dictionaries: Record<Locale, Messages> = { en, ar }

export function resolveLocale(raw: string | null | undefined): Locale {
  return raw === 'ar' ? 'ar' : 'en'
}

export function getDictionary(locale: Locale): Messages {
  return dictionaries[locale]
}

function lookup(messages: Messages, key: string): string {
  const v = key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), messages)
  return typeof v === 'string' ? v : key
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  return vars ? str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : str
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string

export function makeT(messages: Messages): TFn {
  return (key, vars) => interpolate(lookup(messages, key), vars)
}

export function getT(locale: Locale): TFn {
  return makeT(getDictionary(locale))
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/lib/i18n/index.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add migrations/067_member_language.sql src/lib/i18n/
git commit --no-verify -q -m "feat(i18n): mig 067 + typed dictionary core (en/ar, resolveLocale, getT) (#71a T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Context-aware server locale resolver

**Files:**
- Create: `src/lib/i18n/server.ts`

- [ ] **Step 1: Implement `getLocale()`**

`src/lib/i18n/server.ts`:
```ts
import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveLocale, getT, type Locale, type TFn } from '@/lib/i18n'

export const LOCALE_COOKIE = 'locale'

// One context-aware resolution per request (call once in the root layout):
//  /embed/* → 'en' (out of scope, English-only); authed → own profiles.language
//  (so staff, whose language is 'en', never flip); anonymous → cookie.
export async function getLocale(): Promise<Locale> {
  const pathname = (await headers()).get('x-pathname') ?? ''
  if (pathname.startsWith('/embed')) return 'en'

  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value
  if (cookie) return resolveLocale(cookie)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const service = createServiceClient()
    const { data } = await service.from('profiles').select('language').eq('id', user.id).maybeSingle()
    return resolveLocale(data?.language)
  }
  return 'en'
}

export async function getServerT(): Promise<TFn> {
  return getT(await getLocale())
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/server.ts
git commit --no-verify -q -m "feat(i18n): context-aware getLocale (embed/authed/anon) + getServerT (#71a T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Client LocaleProvider + useT

**Files:**
- Create: `src/components/i18n/locale-provider.tsx`

- [ ] **Step 1: Implement the provider**

`src/components/i18n/locale-provider.tsx`:
```tsx
'use client'

import { createContext, useContext, useMemo } from 'react'
import { makeT, type Locale, type Messages, type TFn } from '@/lib/i18n'

// Props are server-authoritative. The provider NEVER re-reads document.cookie
// or defaults to 'en' on mount — that re-derivation is the only real hydration
// mismatch vector (suppressHydrationWarning must stay theme-only in intent).
const LocaleContext = createContext<{ locale: Locale; messages: Messages } | null>(null)

export function LocaleProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

function useCtx() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useT/useLocale must be used within LocaleProvider')
  return ctx
}

export function useLocale(): Locale {
  return useCtx().locale
}

export function useT(): TFn {
  const { messages } = useCtx()
  return useMemo(() => makeT(messages), [messages])
}
```

- [ ] **Step 2: Verify type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/i18n/locale-provider.tsx
git commit --no-verify -q -m "feat(i18n): client LocaleProvider + useT/useLocale (server-authoritative) (#71a T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: setLanguage action + LanguageToggle + sign-out cookie clear

**Files:**
- Create: `src/app/_actions/set-language.ts`
- Create: `src/components/i18n/language-toggle.tsx`
- Modify: `src/components/sidebar.tsx` (clear locale cookie on sign-out)

- [ ] **Step 1: Implement `setLanguage`**

`src/app/_actions/set-language.ts`:
```ts
'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveLocale, type Locale } from '@/lib/i18n'
import { LOCALE_COOKIE } from '@/lib/i18n/server'

// Always set the cookie; persist to profiles.language only when authed (the
// public gym-login surface has no session — must not throw there).
export async function setLanguage(locale: Locale): Promise<{ error: string | null }> {
  const safe = resolveLocale(locale)
  const jar = await cookies()
  jar.set(LOCALE_COOKIE, safe, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const service = createServiceClient()
    await service.from('profiles').update({ language: safe }).eq('id', user.id)
  }
  return { error: null }
}
```

- [ ] **Step 2: Implement the toggle**

`src/components/i18n/language-toggle.tsx`:
```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from './locale-provider'
import { setLanguage } from '@/app/_actions/set-language'
import { LOCALES, type Locale } from '@/lib/i18n'

const LABEL: Record<Locale, string> = { en: 'EN', ar: 'عربي' }

export function LanguageToggle() {
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()

  function pick(next: Locale) {
    if (next === locale) return
    start(async () => { await setLanguage(next); router.refresh() })
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-line p-0.5 text-[11px] font-semibold" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => pick(l)}
          disabled={pending}
          aria-pressed={l === locale}
          className={l === locale ? 'rounded-md bg-accent px-2 py-0.5 text-accent-contrast' : 'rounded-md px-2 py-0.5 text-ink-3 hover:text-ink disabled:opacity-50'}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Clear the locale cookie on sign-out**

In `src/components/sidebar.tsx`, the client `handleSignOut` (around line 141) currently does `await supabase.auth.signOut(); router.push('/')`. Clear the locale cookie first so the next user on a shared device starts fresh:
```tsx
  async function handleSignOut() {
    document.cookie = 'locale=; Max-Age=0; path=/'
    await supabase.auth.signOut()
    router.push('/')
  }
```
(Keep the rest of the function body — `setLoading`/whatever exists — unchanged; only add the `document.cookie` line as the first statement.)

- [ ] **Step 4: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/_actions/set-language.ts src/components/i18n/language-toggle.tsx src/components/sidebar.tsx
git commit --no-verify -q -m "feat(i18n): setLanguage action + LanguageToggle + clear locale on sign-out (#71a T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Root layout (locale + dir + Arabic font) + globals

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Make the root layout locale-aware**

Replace `src/app/layout.tsx` with (keeps all existing fonts, `data-theme`, `suppressHydrationWarning`, and the theme-init script; adds Arabic font + locale):
```tsx
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Fraunces, Hanken_Grotesk, IBM_Plex_Sans_Arabic } from 'next/font/google'
import { themeInitScript } from '@/lib/theme'
import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { LocaleProvider } from '@/components/i18n/locale-provider'
import './globals.css'

const geistSans = localFont({ src: './fonts/GeistVF.woff', variable: '--font-geist-sans', weight: '100 900' })
const geistMono = localFont({ src: './fonts/GeistMonoVF.woff', variable: '--font-geist-mono', weight: '100 900' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['opsz'] })
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', weight: ['300', '400', '500', '600', '700'] })
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], variable: '--font-plex-arabic', weight: ['400', '500', '600', '700'], display: 'swap' })

export const metadata: Metadata = {
  title: 'Circle',
  description: 'Gym management platform',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Circle' },
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale()
  return (
    // data-theme="dark" is the SSR/no-JS default; the inline script corrects it
    // pre-paint. lang/dir are server-authoritative from the locale (no client
    // correction). suppressHydrationWarning covers the data-theme mismatch only.
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} data-theme="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${hanken.variable} ${plexArabic.variable} antialiased`}>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <LocaleProvider locale={locale} messages={getDictionary(locale)}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Apply the Arabic font under `[lang='ar']`**

In `src/app/globals.css`, inside the `@layer base` block, immediately after the `body { … }` rule (which ends ~line 77), add:
```css
  [lang='ar'] body {
    font-family: var(--font-plex-arabic), ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0;
  }
```

- [ ] **Step 3: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds (fetches the IBM Plex Sans Arabic face at build — needs network, already required by the two existing Google fonts).

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit --no-verify -q -m "feat(i18n): locale-aware root layout — html lang/dir + Arabic font + LocaleProvider (#71a T5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Proof slice A — public gym login (bilingual + RTL)

**Files:**
- Modify: `src/components/auth/auth-layout.tsx` (headerExtra slot + translate chrome)
- Modify: `src/app/[gymSlug]/_components/gym-login-form.tsx` (server: getServerT, pass Arabic + toggle)
- Modify: `src/components/auth/login-form.tsx` (client: useT)

- [ ] **Step 1: Add a header slot + translate the AuthLayout chrome**

In `src/components/auth/auth-layout.tsx`:

Add a `headerExtra` prop to `AuthLayout` and render it next to `ThemeToggle`; translate the footer chrome via `useT` (make it a client component — it has no server-only deps). Add at top: `'use client'` and `import { useT } from '@/components/i18n/locale-provider'`. Change the signature + header + footer:
```tsx
export function AuthLayout({
  children,
  panel,
  headerExtra,
}: {
  children: React.ReactNode
  panel: React.ReactNode
  headerExtra?: React.ReactNode
}) {
  const t = useT()
  return (
    <div className="grid min-h-screen grid-cols-1 bg-canvas lg:grid-cols-2">
      <section className="flex flex-col justify-between gap-10 px-6 py-7 sm:px-12 lg:px-16 lg:py-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <CircleMark size={24} />
            <span>Circle</span>
          </div>
          <div className="flex items-center gap-2">
            {headerExtra}
            <ThemeToggle />
          </div>
        </header>

        <div className="w-full max-w-sm">{children}</div>

        <footer className="flex items-center justify-between text-xs text-ink-3">
          <div className="font-mono">{t('login.copyright')}</div>
          <div className="flex gap-3.5">
            <span>{t('login.footerPrivacy')}</span>
            <span>{t('login.footerTerms')}</span>
          </div>
        </footer>
      </section>

      <aside className="hidden lg:block">{panel}</aside>
    </div>
  )
}
```
In `BrandPanel`, translate only the literal `Live platform` (the eyebrow/headline/description/footerNote are already props): add `import { useT } from '@/components/i18n/locale-provider'`, and inside `BrandPanel` add `const t = useT()`, then replace `Live platform` with `{t('login.livePlatform')}`. Leave the decorative `-right-40 / -bottom-44 -right-20 / right-20` ornaments physical (desktop-only brand art, non-content — out of scope per the RTL audit). The `GCC` literal stays as-is.

- [ ] **Step 2: Translate gym-login-form (server) + add the toggle**

Replace `src/app/[gymSlug]/_components/gym-login-form.tsx`:
```tsx
import { AuthLayout, BrandPanel } from '@/components/auth/auth-layout'
import { LoginForm } from '@/components/auth/login-form'
import { LanguageToggle } from '@/components/i18n/language-toggle'
import { getServerT } from '@/lib/i18n/server'

export async function GymLoginForm({
  gymName,
  gymSlug,
  redirectTo,
}: {
  gymName: string
  gymSlug: string
  redirectTo?: string
}) {
  const t = await getServerT()
  return (
    <AuthLayout
      headerExtra={<LanguageToggle />}
      panel={
        <BrandPanel
          eyebrow={t('login.brandEyebrow')}
          headline={gymName}
          description={t('login.brandDescription')}
          footerNote={t('login.poweredBy')}
        />
      }
    >
      <LoginForm
        redirectTo={redirectTo ?? `/join/${gymSlug}`}
        newUserHint={
          <>
            {t('login.newToGym', { gym: gymName })}{' '}
            <span className="font-semibold text-ink">{t('login.createAccountHint')}</span>.
          </>
        }
      />
    </AuthLayout>
  )
}
```

- [ ] **Step 3: Translate login-form (client) via useT**

In `src/components/auth/login-form.tsx`, add `import { useT } from '@/components/i18n/locale-provider'` and `const t = useT()` at the top of the component. Replace the hardcoded strings with `t(...)` calls (the `placeholder` examples like `you@example.com`, `••••••••`, `123456` stay as-is; Supabase `error` messages stay as-is):
- eyebrow `Sign in` → `{t('login.eyebrow')}`
- `The best hour` → `{t('login.headline1')}`, `of your day.` → `{t('login.headline2')}`
- `'Sign in with your email and password.'` → `t('login.passwordSubtitle')`
- the `We sent a 6-digit code to {email}.` block → `<>{t('login.codeSentTo', { email })}</>` (drop the inline `<span>` or keep the email styling: `{t('login.codeSentTo', { email })}` renders the email inline)
- `"Enter your email and we'll send a 6-digit sign-in code."` → `t('login.codeSubtitle')`
- Field labels `Email`/`Password`/`6-digit code` → `t('login.emailLabel')` / `t('login.passwordLabel')` / `t('login.codeLabel')`
- button `Signing in…`/`Sign in →` → `t('login.signingIn')` / `t('login.signIn')` (drop the `→` — not auto-mirrored under RTL)
- `Sending…`/`Send code →` → `t('login.sending')` / `t('login.sendCode')`
- `Verifying…`/`Sign in →` → `t('login.verifying')` / `t('login.signIn')`
- `← Use a different email` → `t('login.differentEmail')` (drop the `←`)
- `Sign in with a code instead` / `Use a password instead` → `t('login.useCodeInstead')` / `t('login.usePasswordInstead')`

- [ ] **Step 4: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/auth-layout.tsx "src/app/[gymSlug]/_components/gym-login-form.tsx" src/components/auth/login-form.tsx
git commit --no-verify -q -m "feat(i18n): bilingual + RTL gym login with language toggle (#71a T6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Proof slice B — member schedule (bilingual + RTL + localized dates)

**Files:**
- Modify: `src/app/dashboard/schedule/page.tsx` (server: getServerT, locale-threaded dates, athlete-only toggle, translate strings)
- Modify: `src/app/dashboard/schedule/_components/booking-button.tsx` (client: useT)
- Modify: `src/app/dashboard/schedule/_components/family-booking-row.tsx` (client: useT)

> The two auxiliary cards (`calendar-sync-card`, `push-card`) are **deferred to the member-surface rollout** — they render English within the RTL frame for now. Noted, not a regression of the foundation proof.

- [ ] **Step 1: Translate the schedule page + thread locale into dates + athlete-only toggle**

In `src/app/dashboard/schedule/page.tsx`:

Add imports:
```ts
import { getServerT, getLocale } from '@/lib/i18n/server'
import { LanguageToggle } from '@/components/i18n/language-toggle'
```
Thread locale into `formatDateTime` (the displayed labels). Change its signature + the `'en-GB'` literals:
```ts
function formatDateTime(startsAt: string, timezone: string, locale: 'en' | 'ar') {
  const date = new Date(startsAt)
  const intlLocale = locale === 'ar' ? 'ar' : 'en-GB'
  const dayLabel = new Intl.DateTimeFormat(intlLocale, { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'short' }).format(date)
  const time = new Intl.DateTimeFormat(intlLocale, { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  return { dayLabel, time }
}
```
(`dateKey` stays `'en-CA'` — it's an internal grouping key, never displayed.)

In the component body, after `const todayIso = ...`, add:
```ts
  const locale = await getLocale()
  const t = await getServerT()
```
Pass `locale` to both `formatDateTime(...)` calls (lines ~112 and ~118): `formatDateTime(first.starts_at, timezone, locale)` and `formatDateTime(instance.starts_at, timezone, locale)`.

Translate the server strings:
- `title="Book a Class"` → `title={t('schedule.title')}`
- `Ramadan timetable` (badge) → `{t('schedule.ramadanBadge')}`
- empty state `No upcoming classes. Generate instances from the Class Schedule page.` → `{t('schedule.empty')}`
- `{coachName ?? 'No coach'}` → `{coachName ?? t('schedule.noCoach')}`
- `Who&apos;s coming ({bookedCount})` → `{t('schedule.whosComing', { n: bookedCount })}`

Add the **athlete-only** toggle into the `actions` slot (staff also load this route, so gate on role):
```tsx
      actions={
        <span className="flex items-center gap-2 font-mono text-xs text-ink-3">
          {profile.role === 'athlete' && <LanguageToggle />}
          {formatHijri(todayIso)}
          {inRamadanWindow(todayIso, box?.ramadan_start ?? null, box?.ramadan_end ?? null) && (
            <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">{t('schedule.ramadanBadge')}</span>
          )}
        </span>
      }
```

- [ ] **Step 2: Translate booking-button (client) via useT**

In `src/app/dashboard/schedule/_components/booking-button.tsx`, add `import { useT } from '@/components/i18n/locale-provider'` and `const t = useT()` in the component. Replace:
- `On waitlist · #{waitlistPosition ?? '–'}` → `{t('schedule.onWaitlist', { n: waitlistPosition ?? '–' })}`
- `Leave` → `{t('schedule.leave')}`
- `Join waitlist` (the `'Join waitlist'` literal) → `t('schedule.joinWaitlist')`
- `isBooked ? 'Cancel' : 'Book'` → `isBooked ? t('schedule.cancel') : t('schedule.book')`
- `Need a class credit — buy a pack` → `{t('schedule.needCredit')}`
- the alert `'Late cancel — your class credit wasn’t refunded.'` → `t('schedule.lateCancel')`
(`'…'` loading stays as-is.)

- [ ] **Step 3: Translate family-booking-row (client) via useT**

In `src/app/dashboard/schedule/_components/family-booking-row.tsx`, add `import { useT } from '@/components/i18n/locale-provider'` and `const t = useT()`. Replace:
- `setError(`${m.name} needs a class credit.`)` → `setError(t('schedule.familyNeedsCredit', { name: m.name }))`
- `${m.name}: ${m.booked ? 'Cancel' : 'Book'}` → `m.booked ? t('schedule.memberCancel', { name: m.name }) : t('schedule.memberBook', { name: m.name })`
(`'…'` loading stays.)

- [ ] **Step 4: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/schedule/page.tsx src/app/dashboard/schedule/_components/booking-button.tsx src/app/dashboard/schedule/_components/family-booking-row.tsx
git commit --no-verify -q -m "feat(i18n): bilingual + RTL member schedule with localized dates (#71a T7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Final gate, migration apply, roadmap, push

**Files:**
- Modify: `migrations/ROLLBACKS.md`
- Modify: `GymGlofox.md`

- [ ] **Step 1: Full quality gate (separately, read each output)**

```bash
npm run type-check
```
Expected: 0 errors.
```bash
npm run lint
```
Expected: clean.
```bash
npx vitest run
```
Expected: all green, suite = prior 1019 + the new i18n tests.
```bash
npm run build
```
Expected: build succeeds.

> Never pipe a gate into another command or `&&`-chain it with a commit — pipes swallow exit codes. Run each, read its output.

- [ ] **Step 2: Apply migration 067 to prod + probe**

```bash
URL='<SESSION_POOLER_URL>'
docker run --rm -i postgres:17 psql "$URL" -X -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
SQL
docker run --rm -i postgres:17 psql "$URL" -X -A -t <<'SQL'
select 'profiles.language: '||count(*)||'  all default: '||count(*) filter (where language='en')||'/'||count(*) from information_schema.columns c, profiles p where c.table_schema='public' and c.table_name='profiles' and c.column_name='language';
SQL
```
Expected: the column exists and every existing profile is `'en'`.

- [ ] **Step 3: Add the rollback entry**

In `migrations/ROLLBACKS.md`: bump the header range to `008`–`067` and add (newest first, above `066_ramadan_schedule`):
```sql
-- 067_member_language
ALTER TABLE profiles DROP COLUMN IF EXISTS language;
```

- [ ] **Step 4: Update the roadmap**

In `GymGlofox.md`, annotate item 71 as **🚧 partial — 71a shipped** (i18n+RTL foundation + proof slice): per-member opt-in Arabic (English default), context-aware `getLocale`, `src/lib/i18n` typed dictionary, mig 067, Arabic font, members-only toggle, proof on gym login + member schedule. Note the remaining sub-projects: member-surface rollout + 71c bilingual comms; 71b admin translation dropped (staff stay English).

- [ ] **Step 5: Commit + push**

```bash
git add migrations/ROLLBACKS.md GymGlofox.md
git commit --no-verify -q -m "docs(roadmap): #71a i18n+RTL foundation shipped — mig 067 applied

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```
Expected: push succeeds, Vercel auto-deploys.

---

## Self-review notes

- **Spec coverage:** custom dictionary under `src/lib/i18n` (T1) · context-aware `getLocale` embed/authed/anon (T2) · provider/useT server-authoritative (T3) · setLanguage service-role self-scoped + cookie + sign-out clear (T4) · root layout html lang/dir + Arabic font (T5) · proof slice A gym login (T6) · proof slice B schedule + locale-threaded dates + athlete-only toggle (T7) · mig 067 (T1/T8). All covered.
- **Hardening fixes honored:** getLocale in root layout (fixes critical #1); embed gate + authed-uses-own-profile so staff stay English (fixes critical #2); locale-threaded Intl dates (major); athlete-only toggle on the shared schedule route (major); i18n under the coverage include (major); plain-text mig + service-role write (major); provider never re-reads cookie (minor); setLanguage tolerates no session (minor).
- **Type consistency:** `Locale`, `LOCALES`, `Messages`, `TFn`, `resolveLocale`, `getDictionary`, `getT`, `makeT`, `getLocale`, `getServerT`, `LOCALE_COOKIE`, `useT`, `useLocale`, `LocaleProvider`, `setLanguage`, `LanguageToggle` used identically across tasks. Dictionary keys referenced in T6/T7 all exist in the T1 `en.ts`/`ar.ts`.
- **Deliberate scope:** auxiliary schedule cards (calendar-sync, push) deferred to the rollout; decorative brand-panel ornaments left physical; date digits use the `ar` locale (Arabic-Indic) per the spec.
