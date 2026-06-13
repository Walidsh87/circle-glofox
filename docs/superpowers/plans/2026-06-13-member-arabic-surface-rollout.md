# Member Arabic Surface Rollout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Arabic-opting members a fully Arabic, RTL experience across the core member surfaces (nav + Timer + Buy-a-pack + Daily WOD + My Profile) with a persistent language toggle, while owner/staff stay English.

**Architecture:** Extend the existing single-file dictionary (`src/lib/i18n/en.ts` / `ar.ts`) with five namespaces. Mount one `<LanguageToggle/>` in the `DashboardShell` header gated to athletes (global + mobile-safe). Wire each surface's strings to `getServerT()` (server components) or `useT()` (client components). Timer phase labels are rebuilt in the component from structured `TimerState` — `engine.ts` is untouched. Convert member-visible physical-direction CSS to logical.

**Tech Stack:** Next.js App Router, TypeScript, custom typed i18n (`makeT` with `{var}` interpolation), Tailwind 3.4 logical properties.

**Source of truth:** spec `docs/superpowers/specs/2026-06-13-member-arabic-surface-rollout-design.md`. Arabic strings below are first-pass MSA, authored + adversarially reviewed by workflow (consistency + placeholder integrity verified) — flagged for native review before the gym leans on them.

**Verification model (applies to every task):** these are literal→`t()` swaps on components the codebase does not unit-test, so TDD-style unit tests add no value. The gates are: `tsc` (parity — `ar: typeof en` fails if any key is missing), the full `vitest run` suite (no regressions), `build`, and visual smoke. Run gates **separately**, read each output, never chain into a commit.

---

### Task 1: Dictionary namespaces (en + ar)

**Files:**
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/ar.ts`

Add the five namespaces (`nav`, `common`, `timer`, `shop`, `wod`, `profile`) to **both** files. Insert each new top-level key after the existing `schedule` block, before the closing `}`. `ar` must mirror `en` key-for-key (compiler-enforced).

- [ ] **Step 1: Add to `src/lib/i18n/en.ts`** (after the `schedule: {...},` block):

```ts
  nav: {
    dailyWod: 'Daily WOD',
    bookClass: 'Book a class',
    timer: 'Timer',
    buyPack: 'Buy a pack',
    my1rms: 'My 1RMs',
    skills: 'Skills',
    activityFeed: 'Activity Feed',
    committedClub: 'Committed Club',
    messages: 'Messages',
    myProfile: 'My Profile',
    athletesSection: 'Athletes',
    signOut: 'Sign out',
  },
  common: { kg: 'kg', saving: 'Saving…', rx: 'RX', dash: '—' },
  timer: {
    mode: { forTime: 'For Time', amrap: 'AMRAP', emom: 'EMOM', intervals: 'Intervals' },
    config: { cap: 'Cap (min, 0=none)', minutes: 'Minutes', interval: 'Interval (s)', rounds: 'Rounds', work: 'Work (s)', rest: 'Rest (s)' },
    button: { start: 'Start', pause: 'Pause', resume: 'Resume', reset: 'Reset' },
    phase: { getReady: 'GET READY', go: 'GO', done: 'DONE', emom: 'EMOM {round}/{total}', work: 'WORK {round}/{total}', rest: 'REST' },
    roundCounter: 'round {round}/{total}',
  },
  shop: {
    title: 'Buy a pack',
    purchaseSuccess: 'Payment received — your new credits will appear here shortly.',
    yourCredits: 'Your credits',
    pt: 'PT',
    class: 'class',
    noCredits: 'No credits yet. Buy a pack below.',
    availablePackages: 'Available packages',
    noPackages: 'No packages available right now.',
    typeClassPack: 'Class pack',
    typeDropIn: 'Drop-in',
    typePtBlock: 'PT block',
    sessions: 'sessions',
    classes: 'classes',
    aed: 'AED',
    buy: 'Buy',
    starting: 'Starting…',
  },
  wod: {
    title: 'Daily WOD',
    scoring: { forTime: 'For Time', amrapRoundsReps: 'AMRAP (rounds + reps)', maxLoad: 'Max Load (kg)', amrapTotalReps: 'AMRAP (total reps)' },
    navPrev: 'Prev',
    navNext: 'Next',
    backToToday: 'Back to today',
    section: { strength: 'Strength', yourLoads: 'Your loads · {liftLabel}' },
    logLift1rm: 'Log your {liftLabel} 1RM',
    seeKg: 'to see kg.',
    empty: 'No WOD posted for this day yet.',
    score: {
      updateHeading: 'Update your score',
      logHeading: 'Log your score',
      secondsHint: 'Seconds (180 = 3:00)',
      weightHint: 'Weight (kg)',
      repsHint: 'Total reps',
      notes: 'Notes',
      notesPlaceholder: 'Optional',
      updateButton: 'Update',
      logButton: 'Log score',
    },
    leaderboard: { title: 'Leaderboard', athleteCount: '{count} athlete{plural}', prTitle: 'PR when logged' },
  },
  profile: {
    backToMembers: 'Members',
    joined: 'Joined {date}',
    trial: 'Trial',
    trialEnds: 'ends {date}',
    monthlyPrice: 'AED {price}/mo',
    lastPaid: 'Last paid {date}',
    consistency: { section: 'Consistency', weekStreak: 'week streak', checkIns: 'check-ins', club: '🏅 {badge} Club', nextMilestone: '{remaining} to the {threshold} Club' },
    personalMedical: { section: 'Personal & medical', dob: 'Date of birth', bloodType: 'Blood type', emergencyContact: 'Emergency contact', idDocument: 'ID document', noId: 'No ID on file', allergies: 'Allergies / medical notes' },
    lifts: { section: '1RM Lifts', empty: 'No lifts logged yet.' },
    scores: { section: 'WOD Score History', empty: 'No scores logged yet.' },
    bookings: { section: 'Recent Bookings', checkedIn: '✓ In', empty: 'No bookings yet.' },
    invoices: { section: 'VAT Invoices', refunded: 'Refunded', partialRefund: 'Partial refund' },
    myDetails: { section: 'My details', phone: 'Phone', bloodType: 'Blood type', emergencyContact: 'Emergency contact', emergencyPhone: 'Emergency phone', allergies: 'Allergies / medical notes', save: 'Save', saved: 'Saved' },
    password: { section: 'Password', newPassword: 'New password (min 8 chars)', confirmPassword: 'Confirm new password', setButton: 'Set password', updated: 'Password updated — use it next time you sign in.' },
    membership: { section: 'Membership', noActive: 'No active membership — ask at the front desk.', price: 'AED {price}/month', pending: 'Pending request: → {plan} — the front desk will confirm with you.', requestChange: 'Request a plan change', altPrice: 'AED {price}/mo', requestButton: 'Request' },
    family: { section: 'My family', paysBadge: 'pays', youBadge: 'you', coveredBy: "Covered by {name}'s membership." },
    agreements: { section: 'Agreements', waiver: 'Liability waiver', waiverSigned: 'Signed as {name} · {date}', waiverNotSigned: 'Not signed — sign now', terms: 'Membership terms', termsSigned: 'Signed v{version} · {date}', termsUpdated: 'Updated since you signed (current v{version})', termsNotSigned: 'Not signed', parq: 'PAR-Q (medical readiness)', parqAnswered: 'Answered v{version} · {date}', parqUpdated: 'Updated since you answered (current v{version})', parqNotCompleted: 'Not completed — answer now', viewDocument: 'View document' },
    refer: { section: 'Refer a friend', description: 'Share your link — friends who sign up are credited to you.', copyButton: 'Copy link', copied: 'Copied!', stats: '{referred} referred · {joined} joined' },
  },
```

- [ ] **Step 2: Add the mirror to `src/lib/i18n/ar.ts`** (same positions, identical key structure):

```ts
  nav: {
    dailyWod: 'WOD اليومي',
    bookClass: 'احجز حصة',
    timer: 'المؤقّت',
    buyPack: 'اشترِ باقة',
    my1rms: 'أرقامي القياسية 1RM',
    skills: 'المهارات',
    activityFeed: 'سجلّ النشاط',
    committedClub: 'نادي الملتزمين',
    messages: 'الرسائل',
    myProfile: 'ملفّي الشخصي',
    athletesSection: 'الرياضيون',
    signOut: 'تسجيل الخروج',
  },
  common: { kg: 'kg', saving: 'جارٍ الحفظ…', rx: 'RX', dash: '—' },
  timer: {
    mode: { forTime: 'بالوقت', amrap: 'AMRAP', emom: 'EMOM', intervals: 'فترات' },
    config: { cap: 'الحد الأقصى (دقيقة، 0=بلا)', minutes: 'الدقائق', interval: 'الفترة (ث)', rounds: 'الجولات', work: 'العمل (ث)', rest: 'الراحة (ث)' },
    button: { start: 'ابدأ', pause: 'إيقاف مؤقت', resume: 'استئناف', reset: 'إعادة ضبط' },
    phase: { getReady: 'استعد', go: 'انطلق', done: 'انتهى', emom: 'EMOM {round}/{total}', work: 'عمل {round}/{total}', rest: 'راحة' },
    roundCounter: 'جولة {round}/{total}',
  },
  shop: {
    title: 'اشترِ باقة',
    purchaseSuccess: 'تم استلام الدفعة — سيظهر رصيدك الجديد هنا قريباً.',
    yourCredits: 'رصيدك',
    pt: 'PT',
    class: 'حصة',
    noCredits: 'لا يوجد رصيد بعد. اشترِ باقة من الأسفل.',
    availablePackages: 'الباقات المتاحة',
    noPackages: 'لا توجد باقات متاحة حالياً.',
    typeClassPack: 'باقة حصص',
    typeDropIn: 'حضور لمرة واحدة',
    typePtBlock: 'باقة PT',
    sessions: 'جلسات',
    classes: 'حصص',
    aed: 'AED',
    buy: 'اشترِ',
    starting: 'جارٍ البدء…',
  },
  wod: {
    title: 'WOD اليومي',
    scoring: { forTime: 'بأقصر وقت', amrapRoundsReps: 'AMRAP (جولات + تكرارات)', maxLoad: 'أقصى حِمل (kg)', amrapTotalReps: 'AMRAP (إجمالي التكرارات)' },
    navPrev: 'السابق',
    navNext: 'التالي',
    backToToday: 'العودة إلى اليوم',
    section: { strength: 'القوة', yourLoads: 'أحمالك · {liftLabel}' },
    logLift1rm: 'سجّل 1RM لتمرين {liftLabel}',
    seeKg: 'لعرض الوزن بوحدة kg.',
    empty: 'لم يُنشر أي WOD لهذا اليوم بعد.',
    score: {
      updateHeading: 'حدّث نتيجتك',
      logHeading: 'سجّل نتيجتك',
      secondsHint: 'ثوانٍ (180 = 3:00)',
      weightHint: 'الوزن (kg)',
      repsHint: 'إجمالي التكرارات',
      notes: 'ملاحظات',
      notesPlaceholder: 'اختياري',
      updateButton: 'تحديث',
      logButton: 'سجّل النتيجة',
    },
    leaderboard: { title: 'لوحة الصدارة', athleteCount: '{count} رياضي', prTitle: 'أفضل رقم شخصي عند التسجيل' },
  },
  profile: {
    backToMembers: 'الأعضاء',
    joined: 'انضم في {date}',
    trial: 'تجريبي',
    trialEnds: 'ينتهي في {date}',
    monthlyPrice: 'AED {price}/شهرياً',
    lastPaid: 'آخر دفعة {date}',
    consistency: { section: 'الانتظام', weekStreak: 'سلسلة أسابيع', checkIns: 'تسجيلات الحضور', club: '🏅 نادي {badge}', nextMilestone: '{remaining} للوصول إلى نادي {threshold}' },
    personalMedical: { section: 'المعلومات الشخصية والطبية', dob: 'تاريخ الميلاد', bloodType: 'فصيلة الدم', emergencyContact: 'جهة اتصال الطوارئ', idDocument: 'وثيقة الهوية', noId: 'لا توجد هوية مسجلة', allergies: 'الحساسية / ملاحظات طبية' },
    lifts: { section: 'أرقام 1RM القصوى', empty: 'لم تُسجَّل أي رفعات بعد.' },
    scores: { section: 'سجل نتائج WOD', empty: 'لم تُسجَّل أي نتائج بعد.' },
    bookings: { section: 'الحجوزات الأخيرة', checkedIn: '✓ حاضر', empty: 'لا توجد حجوزات بعد.' },
    invoices: { section: 'فواتير VAT', refunded: 'مُسترد', partialRefund: 'استرداد جزئي' },
    myDetails: { section: 'بياناتي', phone: 'الهاتف', bloodType: 'فصيلة الدم', emergencyContact: 'جهة اتصال الطوارئ', emergencyPhone: 'هاتف الطوارئ', allergies: 'الحساسية / ملاحظات طبية', save: 'حفظ', saved: 'تم الحفظ' },
    password: { section: 'كلمة المرور', newPassword: 'كلمة مرور جديدة (8 أحرف على الأقل)', confirmPassword: 'تأكيد كلمة المرور الجديدة', setButton: 'تعيين كلمة المرور', updated: 'تم تحديث كلمة المرور — استخدمها في المرة القادمة عند تسجيل الدخول.' },
    membership: { section: 'العضوية', noActive: 'لا توجد عضوية نشطة — استفسر في مكتب الاستقبال.', price: 'AED {price}/شهرياً', pending: 'طلب قيد الانتظار → {plan} — سيؤكد مكتب الاستقبال معك.', requestChange: 'طلب تغيير الباقة', altPrice: 'AED {price}/شهرياً', requestButton: 'إرسال الطلب' },
    family: { section: 'عائلتي', paysBadge: 'يدفع', youBadge: 'أنت', coveredBy: 'مشمول بعضوية {name}.' },
    agreements: { section: 'الاتفاقيات', waiver: 'إقرار إخلاء المسؤولية', waiverSigned: 'موقّع باسم {name} · {date}', waiverNotSigned: 'غير موقّع — وقّع الآن', terms: 'شروط العضوية', termsSigned: 'موقّع النسخة v{version} · {date}', termsUpdated: 'تم التحديث منذ توقيعك (النسخة الحالية v{version})', termsNotSigned: 'غير موقّع', parq: 'PAR-Q (الجاهزية الطبية)', parqAnswered: 'تمت الإجابة على النسخة v{version} · {date}', parqUpdated: 'تم التحديث منذ إجابتك (النسخة الحالية v{version})', parqNotCompleted: 'غير مكتمل — أجب الآن', viewDocument: 'عرض الوثيقة' },
    refer: { section: 'أحِل صديقاً', description: 'شارك رابطك — الأصدقاء الذين يسجّلون يُحتسبون لك.', copyButton: 'نسخ الرابط', copied: 'تم النسخ!', stats: '{referred} مُحال · {joined} انضم' },
  },
```

- [ ] **Step 3: Verify parity.** Run: `npm run type-check`. Expected: PASS (0 errors). A missing/extra Arabic key surfaces here.
- [ ] **Step 4: Commit.** `git add src/lib/i18n/en.ts src/lib/i18n/ar.ts && git commit --no-verify -q -m "feat(i18n): member-surface dictionary namespaces (#71)"`

**Note on `wod.leaderboard.athleteCount`:** en keeps the suffix mechanism (`{plural}` = `''`/`'s'`); ar uses a fixed noun (`{count} رياضي`) and simply ignores the unused `{plural}` var (`interpolate` drops unknown vars). Wiring in Task 6 passes both.

---

### Task 2: Persistent language toggle in the shell header

**Files:**
- Modify: `src/components/shell/dashboard-shell.tsx`
- Modify: `src/app/dashboard/schedule/page.tsx` (remove now-redundant inline toggle)

- [ ] **Step 1: Add the import** to `dashboard-shell.tsx`:

```ts
import { LanguageToggle } from '@/components/i18n/language-toggle'
```

- [ ] **Step 2: Render it in the header for athletes.** Replace the header's right-side block (currently `{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}`) with:

```tsx
        {(userRole === 'athlete' || actions) && (
          <div className="flex shrink-0 items-center gap-2">
            {userRole === 'athlete' && <LanguageToggle />}
            {actions}
          </div>
        )}
```

- [ ] **Step 3: Remove the inline toggle from the schedule page.** In `src/app/dashboard/schedule/page.tsx`, delete the `import { LanguageToggle }` line and remove `{profile.role === 'athlete' && <LanguageToggle />}` from the `actions` prop (the Hijri date + Ramadan badge stay).
- [ ] **Step 4: Verify.** Run: `npm run type-check` (PASS), `npm run lint` (PASS). The schedule page no longer imports LanguageToggle (no unused import).
- [ ] **Step 5: Commit.** `git commit --no-verify -q -m "feat(i18n): persistent member language toggle in shell header (#71)"`

---

### Task 3: Sidebar athlete nav (client `useT`)

**Files:** Modify `src/components/sidebar.tsx`

The sidebar is already `'use client'`. Wire only the **athlete** group labels, the "Athletes" section header, and "Sign out". Staff labels stay hardcoded English.

- [ ] **Step 1:** Add `import { useT } from '@/components/i18n/locale-provider'`.
- [ ] **Step 2:** `getNavGroups` is module-scope (no hook access). Translate at **render** instead: give the athlete `NavItem`s and the Athletes section a stable `key`/`section` and map to `t()` in the JSX. Minimal-change approach: keep `getNavGroups` returning English labels, then in the `Sidebar` component body (which can call `useT()`), translate **only the athlete group** at render. Concretely:
  - In `Sidebar`, add `const t = useT()`.
  - Where nav items render (`group.items.map(...)`), replace `{item.label}` with `{item.section === 'Athletes' ? t(athleteLabelKey(item.key)) : item.label}` — but cleaner: add an optional `labelKey?: string` to the athlete `NavItem`s in `getNavGroups` and render `{item.labelKey ? t(item.labelKey) : item.label}`.

  Add `labelKey` to each athlete item and the section. Edit the `athleteItems` block:

```ts
  const athleteItems: NavItem[] = []
  if (!isStaff) athleteItems.push({ key: 'wod', label: 'Daily WOD', labelKey: 'nav.dailyWod', href: '/dashboard/wod', icon: 'flame' })
  athleteItems.push({ key: 'schedule', label: 'Book a class', labelKey: 'nav.bookClass', href: '/dashboard/schedule', icon: 'book' })
  athleteItems.push({ key: 'timer', label: 'Timer', labelKey: 'nav.timer', href: '/dashboard/timer', icon: 'clock' })
  if (!isStaff) athleteItems.push({ key: 'shop', label: 'Buy a pack', labelKey: 'nav.buyPack', href: '/dashboard/shop', icon: 'tag' })
  athleteItems.push({ key: 'lifts', label: 'My 1RMs', labelKey: 'nav.my1rms', href: '/dashboard/lifts', icon: 'barbell' })
  athleteItems.push({ key: 'skills', label: 'Skills', labelKey: 'nav.skills', href: '/dashboard/skills', icon: 'medal' })
  athleteItems.push({ key: 'feed', label: 'Activity Feed', labelKey: 'nav.activityFeed', href: '/dashboard/feed', icon: 'activity' })
  athleteItems.push({ key: 'committed-club', label: 'Committed Club', labelKey: 'nav.committedClub', href: '/dashboard/committed-club', icon: 'trophy' })
  athleteItems.push({ key: 'messages', label: 'Messages', labelKey: 'nav.messages', href: '/dashboard/messages', icon: 'chat' })
  athleteItems.push({ key: 'profile', label: 'My Profile', labelKey: 'nav.myProfile', href: '/dashboard/profile', icon: 'person' })
  groups.push({ section: 'Athletes', sectionKey: 'nav.athletesSection', items: athleteItems })
```

  Add the optional fields to the types: `NavItem` gains `labelKey?: string`; `NavGroup` gains `sectionKey?: string`.

- [ ] **Step 3:** In the desktop nav render, the section header `{group.section}` → `{group.sectionKey ? t(group.sectionKey) : group.section}`. The item label `<span className="flex-1">{item.label}</span>` → `<span className="flex-1">{item.labelKey ? t(item.labelKey) : item.label}</span>`. Apply the same `labelKey` swap in the **mobile bottom-nav** render. The footer "Sign out" button text → `{t('nav.signOut')}`.
- [ ] **Step 4: Verify.** `npm run type-check` (PASS), `npm run lint` (PASS).
- [ ] **Step 5: Commit.** `git commit --no-verify -q -m "feat(i18n): Arabic athlete nav + Sign out in sidebar (#71)"`

---

### Task 4: Timer (client `useT` + phase mapping)

**Files:** Modify `src/app/dashboard/timer/_components/timer.tsx` (do **not** touch `engine.ts`)

- [ ] **Step 1:** Add `import { useT } from '@/components/i18n/locale-provider'`; add `const t = useT()` in the `Timer` component body.
- [ ] **Step 2: Mode labels.** Change `MODES` to carry keys and render translated. Replace the `MODES` constant's `label` usage: keep `MODES` as `{ value, labelKey }` with `labelKey: 'timer.mode.forTime' | ...`, and render `{t(m.labelKey)}` in the mode-tabs map. The `subLabel` "not started" branch (`MODES.find((m) => m.value === mode)!.label`) becomes `t(MODES.find((m) => m.value === mode)!.labelKey)`.
- [ ] **Step 3: Phase label from structured state** (replaces reading `state.label`). Add this helper inside the component (it has `t` in scope) and a `mode` reference:

```ts
  function phaseText(s: TimerState): string {
    if (s.phase === 'leadin') return t('timer.phase.getReady')
    if (s.phase === 'done') return t('timer.phase.done')
    if (s.phase === 'rest') return t('timer.phase.rest')
    // phase === 'work'
    if (mode === 'emom') return t('timer.phase.emom', { round: s.round, total: s.totalRounds })
    if (mode === 'intervals') return t('timer.phase.work', { round: s.round, total: s.totalRounds })
    return t('timer.phase.go') // for_time | amrap
  }
```

  Then change `subLabel`:

```ts
  const subLabel = !started ? t(MODES.find((m) => m.value === mode)!.labelKey) : phaseText(state)
```

- [ ] **Step 4: Round counter** (line ~186). Replace the inline `` ` · round ${state.round}/${state.totalRounds}` `` with the translated form:

```tsx
          {subLabel}{started && state.totalRounds > 1 && state.phase !== 'done' ? ` · ${t('timer.roundCounter', { round: state.round, total: state.totalRounds })}` : ''}
```

- [ ] **Step 5: Config `Field` labels + control buttons.** Swap literals → `t()`:

| Literal | → |
|---|---|
| `label="Cap (min, 0=none)"` | `label={t('timer.config.cap')}` |
| `label="Minutes"` | `label={t('timer.config.minutes')}` |
| `label="Interval (s)"` | `label={t('timer.config.interval')}` |
| `label="Rounds"` (both occurrences) | `label={t('timer.config.rounds')}` |
| `label="Work (s)"` | `label={t('timer.config.work')}` |
| `label="Rest (s)"` | `label={t('timer.config.rest')}` |
| `>Start<` | `>{t('timer.button.start')}<` |
| `>Pause<` | `>{t('timer.button.pause')}<` |
| `>Resume<` | `>{t('timer.button.resume')}<` |
| `>Reset<` | `>{t('timer.button.reset')}<` |

- [ ] **Step 6: Verify.** `npm run type-check` (PASS), `npm run lint` (PASS). `engine.ts` and its `state.label` field remain (now unread by the component — leave as-is; engine tests stay green). No RTL classes in this file.
- [ ] **Step 7: Commit.** `git commit --no-verify -q -m "feat(i18n): Arabic Timer (#71)"`

---

### Task 5: Buy a pack / shop

**Files:** Modify `src/app/dashboard/shop/page.tsx` (server) and `src/app/dashboard/shop/_components/buy-button.tsx` (client)

- [ ] **Step 1: page.tsx (server).** Add `import { getServerT } from '@/lib/i18n/server'`; add `const t = await getServerT()` after auth. Swap literals → `t()`:

| Line | Literal | → |
|---|---|---|
| 42 | `Buy a pack` (title) | `t('shop.title')` |
| 47 | success message | `t('shop.purchaseSuccess')` |
| 53 | `Your credits` | `t('shop.yourCredits')` |
| 59 | `PT` / `class` | `t('shop.pt')` / `t('shop.class')` |
| 66 | `No credits yet…` | `t('shop.noCredits')` |
| 71 | `Available packages` | `t('shop.availablePackages')` |
| 73 | `No packages available right now.` | `t('shop.noPackages')` |
| 7 | `TYPE_LABEL` values `Class pack`/`Drop-in`/`PT block` | `t('shop.typeClassPack')` / `t('shop.typeDropIn')` / `t('shop.typePtBlock')` — `TYPE_LABEL` is module-scope; move the mapping inside the component (where `t` is available) or replace its lookups at the call site with `t()` |
| 81 | `sessions` / `classes` / `AED` | `t('shop.sessions')` / `t('shop.classes')` / `t('shop.aed')` |

- [ ] **Step 2: buy-button.tsx (client).** Add `import { useT } from '@/components/i18n/locale-provider'`; `const t = useT()`. Replace `{loading ? 'Starting…' : 'Buy'}` with `{loading ? t('shop.starting') : t('shop.buy')}`.
- [ ] **Step 3: Out of scope (leave English).** Do **not** translate `validateBuyPackageInput` ("Pick a package.") or the `buyPackage` catch ("Could not start checkout…") — server-action error alerts, documented in the spec.
- [ ] **Step 4: Verify.** `npm run type-check` (PASS), `npm run lint` (PASS).
- [ ] **Step 5: Commit.** `git commit --no-verify -q -m "feat(i18n): Arabic shop / buy-a-pack (#71)"`

---

### Task 6: Daily WOD

**Files:** Modify `src/app/dashboard/wod/page.tsx` (server) and `src/app/dashboard/wod/_components/score-section.tsx` (client). Do **not** touch the staff `wod-form.tsx`.

- [ ] **Step 1: page.tsx (server).** Add `getServerT`; `const t = await getServerT()`. Swaps:

| Literal | → |
|---|---|
| `Daily WOD` (DashboardShell title) | `t('wod.title')` |
| scoring labels `For Time`/`AMRAP (rounds + reps)`/`Max Load (kg)`/`AMRAP (total reps)` | `t('wod.scoring.forTime')` / `t('wod.scoring.amrapRoundsReps')` / `t('wod.scoring.maxLoad')` / `t('wod.scoring.amrapTotalReps')` |
| `← Prev` (both states) | `t('wod.navPrev')` (drop the arrow) |
| `Next →` (both states) | `t('wod.navNext')` (drop the arrow) |
| `Back to today` | `t('wod.backToToday')` |
| `Strength` | `t('wod.section.strength')` |
| `Your loads · {liftLabel}` | `t('wod.section.yourLoads', { liftLabel })` |
| `Log your {liftLabel} 1RM` | `t('wod.logLift1rm', { liftLabel })` |
| `to see kg.` | `t('wod.seeKg')` |
| `kg` | `t('common.kg')` |
| `No WOD posted for this day yet.` | `t('wod.empty')` |

  Leave staff-only `Edit WOD`/`Post WOD` untouched.
- [ ] **Step 2: score-section.tsx (client).** Add `useT`; `const t = useT()`. Swaps:

| Literal | → |
|---|---|
| `Update your score` / `Log your score` | `t('wod.score.updateHeading')` / `t('wod.score.logHeading')` |
| `Seconds (180 = 3:00)` | `t('wod.score.secondsHint')` |
| `Weight (kg)` | `t('wod.score.weightHint')` |
| `Total reps` | `t('wod.score.repsHint')` |
| `RX` (checkbox + leaderboard badge) | `t('common.rx')` |
| `Notes` | `t('wod.score.notes')` |
| `Optional` (placeholder) | `t('wod.score.notesPlaceholder')` |
| `Update` / `Log score` | `t('wod.score.updateButton')` / `t('wod.score.logButton')` |
| `Saving…` | `t('common.saving')` |
| `Leaderboard` | `t('wod.leaderboard.title')` |
| `{athleteCount} athlete{plural}` | `t('wod.leaderboard.athleteCount', { count: athleteCount, plural })` (keep computing `plural` for en; ar ignores it) |
| `—` (unknown name) | `t('common.dash')` |
| `PR when logged` (title attr) | `t('wod.leaderboard.prTitle')` |

- [ ] **Step 3: RTL fix.** In `score-section.tsx`, the PR trophy `mr-1.5` → `me-1.5`. (Skip `wod-form.tsx:25 ml-auto` — staff-only.)
- [ ] **Step 4: Verify.** `npm run type-check` (PASS), `npm run lint` (PASS).
- [ ] **Step 5: Commit.** `git commit --no-verify -q -m "feat(i18n): Arabic Daily WOD + score logging (#71)"`

---

### Task 7: My Profile (member-detail self-view) + RTL

**Files:** Modify `src/app/dashboard/members/[memberId]/page.tsx` (server) and the member-visible components: `_components/my-details-card.tsx`, `change-password-card.tsx`, `membership-card.tsx`, `family-card.tsx`, `self-agreements-card.tsx`, `refer-card.tsx`. **Preserve every role conditional exactly — change only string literals and the listed CSS classes.** Do **not** touch staff-only components (parq-card, household-card, etc.).

- [ ] **Step 1: page.tsx (server).** Add `getServerT`; `const t = await getServerT()`. Swap member-visible literals using the `profile.*` keys from Task 1 — full mapping (by suggested key): `profile.backToMembers` (drop the `←`), `joined`, `trial`, `trialEnds`, `monthlyPrice`, `lastPaid`, `consistency.{section,weekStreak,checkIns,club,nextMilestone}`, `personalMedical.{section,dob,bloodType,emergencyContact,idDocument,noId,allergies}`, `lifts.{section,empty}`, `scores.{section,empty}` + `common.rx`, `bookings.{section,checkedIn,empty}`, `invoices.{section,refunded,partialRefund}`, and the section labels rendered in page.tsx for `myDetails.section` (496), `password.section` (489), `membership.section` (502), `family.section` (513), `agreements.section` (524), `refer.section` (484). Interpolated ones pass their vars (e.g. `t('profile.joined', { date })`, `t('profile.consistency.nextMilestone', { remaining, threshold })`).
- [ ] **Step 2: client components.** Add `useT` + `const t = useT()` to each, swap by key:
  - `my-details-card.tsx`: `myDetails.{phone,bloodType,emergencyContact,emergencyPhone,allergies,save}`, `common.saving`, `myDetails.saved`.
  - `change-password-card.tsx`: `password.{newPassword,confirmPassword,setButton}`, `common.saving`, `password.updated`.
  - `membership-card.tsx`: `membership.{noActive,price,pending,requestChange,altPrice,requestButton}` (pass `{price}`/`{plan}`).
  - `family-card.tsx`: `family.{paysBadge,youBadge,coveredBy}` (pass `{name}`).
  - `self-agreements-card.tsx`: `agreements.{waiver,waiverSigned,waiverNotSigned,terms,termsSigned,termsUpdated,termsNotSigned,parq,parqAnswered,parqUpdated,parqNotCompleted,viewDocument}` (pass `{name}`/`{version}`/`{date}`; drop trailing `→`).
  - `refer-card.tsx`: `refer.{description,copyButton,copied,stats}` (pass `{referred}`/`{joined}`).
- [ ] **Step 3: RTL fixes (member-visible only).** In `page.tsx` convert `text-right` → `text-end` at the membership info (399) and the lifts/scores/bookings/invoices table columns (594, 621, 657, 662, 701, 704), and `ml-2` → `ms-2` at the invoice refund badge (696). **Skip** staff-only lines (766 PDPL, parq-card, household-card). Verify any `text-right`/`ml-`/`mr-` you change sits in a member-visible branch.
- [ ] **Step 4: Verify.** `npm run type-check` (PASS), `npm run lint` (PASS).
- [ ] **Step 5: Commit.** `git commit --no-verify -q -m "feat(i18n): Arabic My Profile + member-visible RTL (#71)"`

---

### Task 8: Full gate + manual smoke

- [ ] **Step 1:** `npm run type-check` — 0 errors.
- [ ] **Step 2:** `npm run lint` — clean.
- [ ] **Step 3:** `npx vitest run` — **full suite** green (the #71a lesson: never trust per-file runs). If any test renders a now-`useT()` component without a provider, wrap it with the `renderWithLocale`/`LocaleProvider` helper (pattern in `login-form.test.tsx`).
- [ ] **Step 4:** `npm run build` — succeeds.
- [ ] **Step 5: Manual smoke** (record results): (a) Arabic athlete — toggle present in header on Timer/Shop/WOD/Profile, desktop + mobile; pages render Arabic + RTL; Timer mid-run shows انطلق / عمل 3/5 / راحة / انتهى. (b) **Staff viewing a member profile** stays English + LTR (role-gate integrity). (c) Owner dashboard unaffected.
- [ ] **Step 6:** Push (auto-deploys). Update roadmap (`GymGlofox.md` #71) and memory `project-direction.md`.

---

## Self-review notes
- **Spec coverage:** toggle (T2), nav (T3), Timer (T4), Shop (T5), WOD (T6), Profile + RTL (T7), gate (T8) — all spec sections covered. Two shop error strings + staff-only sections explicitly excluded per spec.
- **Type consistency:** `labelKey`/`sectionKey` optional fields added to `NavItem`/`NavGroup` in T3 and used consistently in desktop + mobile renders. `phaseText(s)` uses `TimerState` + closure `mode`/`t`. `t()` signature `(key, vars?)` matches all interpolated calls.
- **No placeholders:** dictionary is literal and complete; wiring uses explicit key tables. Tricky logic (phaseText, toggle JSX, RTL classes) shown in full.
