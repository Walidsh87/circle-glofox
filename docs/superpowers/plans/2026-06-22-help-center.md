# Help Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Foundation is one task; the ~17 guides are authored in parallel (content fan-out) then assembled + accuracy-reviewed.

**Goal:** A staff-facing `/dashboard/help` Help Center — two-pane (topic sidebar + guide), ~17 accurate guides across 4 areas, content as typed data. No DB/migration.

**Architecture:** A typed `HelpGuide` data model + a generic block renderer (XSS-safe). The foundation task builds types/registry/page/renderer/nav + an `overview` guide (the authoring template + default landing). Each of the ~17 guides is a `src/lib/help/guides/<slug>.ts` data file authored independently; the registry aggregates them.

**Tech Stack:** Next.js 16, TypeScript strict, Tailwind, Vitest. No new deps, no markdown parser (typed blocks → JSX).

## Global Constraints
- **No DB, no migration, no new server action, no RLS surface** — read-only static content behind `requireStaffPage`.
- **XSS-safe rendering** — typed blocks → JSX with React-escaped text; links via `next/link` (internal) or `<a target=_blank rel=noopener noreferrer>` (external `https`). Never `dangerouslySetInnerHTML`.
- **Accuracy** — every guide describes what is ACTUALLY built; authors read the relevant code/roadmap before writing. The `CLAUDE.md` roadmap is the feature index.
- English (staff surface, like the rest). DRY/YAGNI; verified Tailwind tokens (`accent-soft`/`surface-2`/`ink`/`ink-2`/`ink-3`/`line`/`accent-ink`).

---

## File Structure
**Create:** `src/lib/help/types.ts`, `src/lib/help/registry.ts`, `src/lib/help/guides/overview.ts` + `guides/<slug>.ts` ×17, `src/app/dashboard/help/page.tsx`, `src/app/dashboard/help/_components/guide-body.tsx`, `src/__tests__/help-registry.test.ts`. **Modify:** `src/components/sidebar.tsx` (nav + icon).

---

### Task 1: Foundation — types, renderer, page, registry, nav, overview guide + test

- [ ] **Step 1: `src/lib/help/types.ts`**
```ts
export type HelpArea = 'setup' | 'money' | 'classes' | 'growth'
export const AREA_ORDER: HelpArea[] = ['setup', 'money', 'classes', 'growth']
export const AREA_LABELS: Record<HelpArea, string> = {
  setup: 'Setup & operations', money: 'Memberships & money',
  classes: 'Classes & programming', growth: 'Growth & integrations',
}
export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'code'; text: string }
  | { type: 'note'; text: string }
  | { type: 'link'; label: string; href: string }
export type HelpGuide = { slug: string; area: HelpArea; title: string; summary: string; blocks: HelpBlock[] }
```

- [ ] **Step 2: `src/lib/help/guides/overview.ts`** (the authoring template + landing guide)
```ts
import type { HelpGuide } from '../types'
export const overview: HelpGuide = {
  slug: 'overview', area: 'setup', title: 'Welcome to the Help Center',
  summary: 'Guides for running your gym on the platform — pick a topic from the left.',
  blocks: [
    { type: 'p', text: 'This Help Center explains how to use each part of the platform. Pick a topic on the left, grouped by area.' },
    { type: 'h', text: 'Where to start' },
    { type: 'steps', items: [
      'New here? Start with Getting started.',
      'Setting up billing? See Taking payments & Stripe.',
      'Connecting other tools? See Integrations (Zapier, API, calendar).',
    ] },
    { type: 'note', text: 'These guides are for gym staff. Members have their own simpler views.' },
  ],
}
```

- [ ] **Step 3: `src/lib/help/registry.ts`** (foundation version imports ONLY overview; the assemble step adds the 17)
```ts
import type { HelpGuide, HelpArea } from './types'
import { AREA_ORDER } from './types'
import { overview } from './guides/overview'

export const HELP_GUIDES: HelpGuide[] = [overview]

export function findGuide(slug: string | undefined): HelpGuide | null {
  if (slug) { const g = HELP_GUIDES.find((x) => x.slug === slug); if (g) return g }
  return HELP_GUIDES[0] ?? null
}
export function guidesByArea(): { area: HelpArea; guides: HelpGuide[] }[] {
  return AREA_ORDER
    .map((area) => ({ area, guides: HELP_GUIDES.filter((g) => g.area === area) }))
    .filter((x) => x.guides.length > 0)
}
```

- [ ] **Step 4: `src/app/dashboard/help/_components/guide-body.tsx`**
```tsx
import Link from 'next/link'
import type { HelpBlock } from '@/lib/help/types'

const isExternal = (href: string) => /^https?:\/\//.test(href)

export function GuideBody({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-ink-2">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h': return <h3 key={i} className="mt-2 text-[14px] font-semibold text-ink">{b.text}</h3>
          case 'p': return <p key={i}>{b.text}</p>
          case 'steps': return <ol key={i} className="ml-5 flex list-decimal flex-col gap-1">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ol>
          case 'bullets': return <ul key={i} className="ml-5 flex list-disc flex-col gap-1">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
          case 'code': return <pre key={i} className="overflow-x-auto rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink">{b.text}</pre>
          case 'note': return <div key={i} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">{b.text}</div>
          case 'link': return isExternal(b.href)
            ? <a key={i} href={b.href} target="_blank" rel="noopener noreferrer" className="w-fit text-accent-ink underline underline-offset-2">{b.label} ↗</a>
            : <Link key={i} href={b.href} className="w-fit text-accent-ink underline underline-offset-2">{b.label}</Link>
        }
      })}
    </div>
  )
}
```

- [ ] **Step 5: `src/app/dashboard/help/page.tsx`**
```tsx
import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { findGuide, guidesByArea } from '@/lib/help/registry'
import { AREA_LABELS } from '@/lib/help/types'
import { GuideBody } from './_components/guide-body'

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const sp = await searchParams
  const { profile, boxName } = await requireStaffPage()
  const guide = findGuide(sp.topic)
  const groups = guidesByArea()

  return (
    <DashboardShell active="help" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="Help Center">
      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="md:w-64 md:shrink-0">
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.area}>
                <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{AREA_LABELS[g.area]}</div>
                <div className="flex flex-col">
                  {g.guides.map((gd) => (
                    <Link key={gd.slug} href={`/dashboard/help?topic=${gd.slug}`}
                      className={`rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${guide?.slug === gd.slug ? 'bg-accent-soft font-semibold text-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
                      {gd.title}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>
        <article className="min-w-0 max-w-2xl flex-1">
          {guide ? (
            <>
              <h2 className="text-lg font-semibold text-ink">{guide.title}</h2>
              <p className="mt-1 text-[13px] text-ink-2">{guide.summary}</p>
              <div className="mt-4"><GuideBody blocks={guide.blocks} /></div>
            </>
          ) : <p className="text-[13px] text-ink-3">No help topics yet.</p>}
        </article>
      </div>
    </DashboardShell>
  )
}
```

- [ ] **Step 6: Nav** — `src/components/sidebar.tsx`. Add a `help` icon to `ICON_PATHS` (verify it renders; if the path looks off, reuse `'book'`):
```tsx
  help: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zM9.6 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7M12 17h.01',
```
Add the nav item to the staff `runTheGym` group (all staff), at the end:
```tsx
  if (isStaff) runTheGym.push({ key: 'help', label: 'Help', href: '/dashboard/help', icon: 'help' })
```

- [ ] **Step 7: Test** — `src/__tests__/help-registry.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { HELP_GUIDES, findGuide, guidesByArea } from '@/lib/help/registry'
import { AREA_ORDER } from '@/lib/help/types'

describe('help registry', () => {
  it('every guide has a unique slug and a valid area', () => {
    const slugs = HELP_GUIDES.map((g) => g.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const g of HELP_GUIDES) {
      expect(AREA_ORDER).toContain(g.area)
      expect(g.title.length).toBeGreaterThan(0)
      expect(g.blocks.length).toBeGreaterThan(0)
    }
  })
  it('findGuide returns the match, else the first guide', () => {
    expect(findGuide('overview')?.slug).toBe('overview')
    expect(findGuide('nope')).toBe(HELP_GUIDES[0])
    expect(findGuide(undefined)).toBe(HELP_GUIDES[0])
  })
  it('guidesByArea groups in AREA_ORDER, no empty areas', () => {
    const groups = guidesByArea()
    for (const g of groups) expect(g.guides.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 8:** `npm run lint && npm run type-check && npm run test` → green. Commit: `feat(help): Help Center foundation — types, renderer, two-pane page, nav, overview`.

---

### Tasks 2–18: Author one guide each (content fan-out)

Each task creates `src/lib/help/guides/<slug>.ts` exporting `export const <camelSlug>: HelpGuide = { slug, area, title, summary, blocks }`, conforming to the `HelpGuide` type, mirroring `overview.ts`. **Author the content grounded in the actual feature** — read the listed source(s) + the `CLAUDE.md` roadmap entry so steps, in-app page paths (as `link` blocks to `/dashboard/...`), and any event/endpoint names are ACCURATE. Keep each guide concise (a summary + ~5–12 blocks: what it does, how to use it step-by-step, key links, gotchas). Do NOT edit `registry.ts` (the assemble task wires all guides). Do NOT commit (the assemble task commits). Just write the file.

| # | slug | area | title | Cover | Read for accuracy |
|---|---|---|---|---|---|
| 2 | getting-started | setup | Getting started | First steps: your gym profile, inviting staff, adding members, the dashboard | `dashboard/page.tsx`, members add flow, roadmap v1 |
| 3 | settings-and-keys | setup | Settings & required keys | What to configure in Settings; the env keys that turn features on (Stripe, Resend email, Twilio SMS/WhatsApp, Anthropic AI parse, VAPID push, CRON_SECRET) | `dashboard/settings/page.tsx`, `src/env.ts`, roadmap "Next session priority" |
| 4 | staff-roles | setup | Staff roles & permissions | owner/admin/coach/receptionist tiers; who can do what; adding staff + changing roles | `lib/auth/roles.ts`, People "Staff" tab, roadmap #57 |
| 5 | security-compliance | setup | Security & compliance | MFA for staff, PDPL data export, liability waivers + membership T&C + PAR-Q medical forms, the audit log | roadmap #69/#70/#9/#68, waivers page |
| 6 | plans-and-packages | money | Membership plans & packages | Recurring plans vs credit packages/drop-ins; trials; freezes; cancellations; assigning a membership | roadmap #27/#28/#29/#32, payments page |
| 7 | payments-and-stripe | money | Taking payments & Stripe | Connecting Stripe; subscriptions vs one-off; the member portal; what's needed before charging | roadmap Tier 1 #1, `lib/psp/*`, settings |
| 8 | invoices-refunds-dunning | money | VAT invoices, refunds & dunning | UAE 5% VAT invoices (TRN, sequential #, PDF), refunds from a member, failed-card dunning + retries | roadmap #2/#6/#7, invoices |
| 9 | front-desk | money | Front desk | Quick search, walk-in → lead → member, take cash, generate a Stripe payment link/QR, sell a pack, desk check-in | roadmap Tier 12 #99–#103, `dashboard/desk/*` |
| 10 | classes-and-scheduling | classes | Classes, schedule & instances | Class templates (recurring), generating dated instances, the Ramadan timetable, coach availability/time-off + cover | roadmap v1 #4/#5, #72, #94, `dashboard/classes` |
| 11 | booking-waitlist-checkin | classes | Booking, waitlist & check-in | Member booking, waitlist + notify, the whiteboard, the coach Floor, reversible check-in, the entitlement gate (paid/credit) | roadmap #6/#26/#90/#89, whiteboard/floor |
| 12 | daily-wod-and-planner | classes | Daily WOD, planner & import | Posting the daily WOD, the month planner, batch paste import, AI parse, scaling tiers | roadmap #8/#11/#16/#17, `dashboard/programming` |
| 13 | program-store | classes | Program Store & selling programs | Authoring program templates (weeks), publish + price, members buy → drip by week, batch text import, the multi-program picker | roadmap #15/#96, `dashboard/program-store` |
| 14 | the-wedge-and-movement-videos | classes | The wedge + movement videos | Per-athlete %→kg loads from stored 1RMs (the wedge); on the WOD/whiteboard/floor; the movement video library (curate YouTube/Vimeo demos) | roadmap v1 #9, #82, `lib/percentage`, `dashboard/movements` |
| 15 | leads-and-lifecycle | growth | Leads, lifecycle & attribution | The leads pipeline, lifecycle board, conversion attribution, referrals + member refer links, follow-up tasks | roadmap #38/#48/#49/#47, `dashboard/lifecycle` |
| 16 | campaigns-and-automations | growth | Campaigns & automations | Broadcasts; email/SMS/WhatsApp campaigns; the automation builder + sequences (triggers); opt-out | roadmap #43/#41/#42/#39/#37/#44, requires Resend/Twilio keys |
| 17 | embed-widgets | growth | Embeddable widgets | The lead-capture + schedule iframe widgets; where to find the snippet (Settings); how they appear on the gym website | roadmap #45/#46, `dashboard/settings` |
| 18 | integrations | growth | Integrations: Zapier, API & calendar | **FLAGSHIP.** Public API + API keys (Settings); webhooks (Settings, event list); **Zapier** — what it does, that "Webhooks by Zapier" needs a paid plan, 3-step connect, + example Zaps: `lead.created`→Google Sheet, `member.created`→Mailchimp, `payment.succeeded`→QuickBooks, Facebook Lead Ad→`POST /api/v1/leads`; calendar sync (per-athlete ICS) | `dashboard/settings/_components/{api-keys-card,webhooks-card}.tsx`, `lib/webhooks/events.ts`, `docs/api/webhooks.md`, roadmap #65/#81 |

Each task ends by confirming the file conforms to `HelpGuide` (it will be type-checked in the assemble step). No commit, no registry edit.

---

### Task 19: Assemble registry + gate + commit
- [ ] Rewrite `src/lib/help/registry.ts` to import all 18 guides (overview + the 17) and list them in `HELP_GUIDES` (overview first, then grouped logically). Keep `findGuide`/`guidesByArea`.
- [ ] `npm run lint && npm run type-check && npm run test` — fix any guide that doesn't conform to `HelpGuide` (type-check catches malformed files). The registry test asserts unique slugs + valid areas + non-empty blocks.
- [ ] `git add -A && git commit -m "feat(help): author all Help Center guides + register (#66 + help center)"`.

---

## Verification (whole branch, before PR)
- Full gate green.
- **Accuracy review** (the important one): reviewers read each guide's `blocks` against the actual feature code and flag anything inaccurate (wrong page path, non-existent option, wrong event/endpoint name) — especially the flagship Integrations guide (event names from `lib/webhooks/events.ts`, the API base `/api/v1`, the "Webhooks by Zapier = paid" caveat).
- `client-boundary-auditor` (the renderer/page import only safe modules; no `dangerouslySetInnerHTML`; external links carry `rel=noopener`), `regression-analyzer` (purely additive — a new page + lib + one nav line; nothing else touched). No migration/tenant reviewer needed (static content, `requireStaffPage`, no DB).
- CI green. Manual: `/dashboard/help` shows the topic sidebar grouped by 4 areas; each guide renders; `?topic=` switches; external links open in a new tab; an athlete cannot reach it (staff gate).

## Scope boundaries (documented)
In: staff Help Center, ~18 guides, two-pane nav, typed content, flagship Integrations/Zapier guide. **Out:** member help, search, images/video, i18n, contextual deep-links, a published Zapier app.
