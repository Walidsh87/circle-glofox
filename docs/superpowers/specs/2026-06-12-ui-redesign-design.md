# UI Redesign — "Ivory & Lime" Design System

**Date:** 2026-06-12
**Status:** Approved by Walid (brainstorming session with visual companion)
**Supersedes:** `2026-05-25-dark-theme-design.md` as the canonical visual spec. The dark palette defined there survives as this system's dark mode.

## 1. Summary

Full visual redesign of every Circle surface, executed as a design-system rebuild. The new identity — **"Ivory & Lime, serif voice"** — pairs a new warm-ivory light mode with the existing near-black dark mode, keeps lime `#C8F135` as the brand accent, and replaces Bricolage Grotesque with **Fraunces** (variable serif) as the display face in both modes. Users switch between light and dark; kiosk hardware is pinned dark.

The redesign is also a structural rebuild: the current UI is ~100% inline `style={{}}` objects (138/142 dashboard files), which cannot express hover/focus states or responsive breakpoints and has produced heavy duplication. All surfaces move to a shared token + component system.

## 2. Decisions made (with alternatives rejected)

| Decision | Chosen | Rejected |
|---|---|---|
| Goal | New look entirely | Re-skin of current brand; specific pages only |
| Direction | Warm premium ("B"), recolored to lime/black | Calm-clean light SaaS; navy dark; bold-loud light |
| Light/dark pairing | Ivory & Lime, **serif voice** (serif evolves both modes) | Ivory + current grotesque type; pure-white sharp |
| Display typeface | **Fraunces** (variable, opsz) | Instrument Serif (single weight); Playfair Display (too formal) |
| Scope | **All surfaces** | Dashboard+member only; member-facing first |
| Theme switching | System preference + manual toggle, per device (localStorage) | Per-account DB preference; gym-decides-for-members |
| Execution | **Design system + batched migration** (shippable batches) | Big-bang branch (merge risk); re-skin without rebuild |

## 3. Design language

### 3.1 Color tokens

One semantic token set, two values per token (scoped under `data-theme`). Components reference tokens only — never raw hex.

| Token | Light ("Ivory") | Dark (evolved from current: borders/surface-2 softened, rest kept) |
|---|---|---|
| `bg` | `#F6F4ED` | `#0F0F0F` |
| `surface` | `#FFFFFF` | `#1A1A1A` |
| `surface-2` | `#FBFAF5` | `#141414` |
| `border` | `#E3DFD2` | `#262626` |
| `border-strong` | `#D8D4C4` | `#333333` |
| `ink` | `#15150F` | `#F0F0F0` |
| `ink-2` | `#6B6757` | `#B0B0B0` |
| `ink-3` | `#8A8674` | `#888888` |
| `ink-faint` | `#B5B1A0` | `#5A5A5A` |
| `accent` | `#C8F135` | `#C8F135` |
| `accent-ink` | `#5C7A00` | `#C8F135` |
| `ok` | `#4A6300` (on `rgba(92,122,0,.12)` fill) | current soft-alpha set |
| `warn` | `#92400E` (on `rgba(180,83,9,.12)` fill) | current soft-alpha set |
| `danger` | `#B3261E` (on `rgba(179,38,30,.10)` fill) | `#FF6B61` |

Rules:
- **Lime is a fill with dark text** in light mode (lime + white text fails contrast). Trend/number text on light uses `accent-ink` olive; brand lime stays for buttons, highlights, and the logo dot.
- `ink-faint` is decorative only — never for copy (current `--c-ink-faint` fails contrast).
- Delete: the unused shadcn HSL token block in `globals.css`, the stray second lime `#C0E050` in keyframes, all hardcoded hex in components.

### 3.2 Typography

| Role | Face | Notes |
|---|---|---|
| Display (h1–h3, hero numbers, wordmark) | **Fraunces** (variable: wght 400–650, opsz auto) | Replaces Bricolage Grotesque, both modes |
| Body | **Hanken Grotesk** | Becomes the *single* body font — removes the 55 inline Geist Sans overrides (two body fonts ship today) |
| Micro-labels, tabular data | **Geist Mono** | Unchanged (`tnum`, uppercase eyebrows) |

Minimum text size rises to **12px** (current 10–11px microcopy is illegible). Type scale otherwise approximates today's.

### 3.3 Shape & motion

- Radii: 12px cards, 8px controls, pill (999px) badges and toggles.
- Motion tokens unchanged: 120/200/320ms; `c-stage-in` (translate+blur enter) and `c-pulse` survive; `prefers-reduced-motion` respected globally as today.

## 4. Theming architecture

- `data-theme="light" | "dark"` on `<html>`.
- An inline script in the root layout (`src/app/layout.tsx`), executed **before paint**, resolves: `localStorage("circle-theme")` → else `prefers-color-scheme` → else **light**. No flash of wrong theme.
- All tokens are CSS variables in `globals.css` under `[data-theme="light"]` and `[data-theme="dark"]` scopes, mapped into `tailwind.config.ts` as semantic utilities (`bg-surface`, `text-ink-2`, `border-line`, `bg-accent`, …).
- **Components never use `dark:` variants** — the variables swap underneath. This is what keeps the 142-file migration tractable.
- `ThemeToggle` component: dashboard sidebar + member-page headers; writes localStorage and the attribute.
- **Pinned dark:** `/tv` and `/checkin` layouts hard-set `data-theme="dark"` and hide the toggle (gym-floor hardware).
- **Emails & embeds render the light palette** (no toggle exists in email clients; ivory degrades gracefully on white hosts). Fixes the current near-invisible `#111`-on-dark buttons.

## 5. Component library

### 5.1 Primitives — `src/components/ui/`

Built with Tailwind semantic utilities + `cva` variants (both installed already; the lone existing `ui/button.tsx` is absorbed):

`Button` (primary-lime / outline / ghost / danger; sm/md/lg), `Field` (input+label+error, `aria-live="polite"` on errors), `Select`, `Card`, `StatCard`, `Badge` (ok/warn/danger/neutral), `Table` + `Th`/`Td` (currently redefined in 6 pages), `PageHeader`, `Dialog`, `Tabs`, `EmptyState`, `Skeleton`, `ThemeToggle`.

Accessibility baked into primitives, not pages: lime `focus-visible` ring (replacing JS-mutated `borderColor` + `outline:none`), 44px minimum touch targets, keyboard-navigable dialogs, contrast guaranteed at token level.

### 5.2 Shell — `src/components/shell/`

- `Sidebar` — rebuilt on `next/link` (currently raw `<a href>` causing full page reloads).
- `MobileNav` — bottom navigation.
- `PageContainer` — standard paddings including the bottom-nav safe area (15 pages currently miss it).

### 5.3 Consolidations

- One `CircleMark` SVG logo component; the duplicate CSS `.circle-mark` class is deleted.
- `TIMEZONE_OFFSETS` (duplicated in ~9 files) → one shared module.
- Page chrome copy-pasted into ~48 dashboard `page.tsx` files → `PageContainer` + `PageHeader`.

## 6. Migration plan — six shippable batches

Old and new looks coexist between batches; every batch ends green (lint, type-check, test) and committed.

| Batch | Contents |
|---|---|
| **B0 Foundations** | Tokens in `globals.css`, Fraunces in / Bricolage out, Tailwind mapping, no-flash theme script, `ThemeToggle`; delete dead shadcn HSL layer + stray lime |
| **B1 Primitives + shell** | `ui/` library, `shell/` (sidebar `next/link` fix), `loading.tsx` + `error.tsx` per major route group (today: zero loading states, one error boundary for 54 routes) |
| **B2 Member-facing** | Root login `/`, `/[gymSlug]`, `/join`, `/onboarding` — rebuilt mobile-first (hard `1fr 1fr` grids today squeeze phones into half a viewport) |
| **B3 Dashboard** | ~54 routes in 5 route-group sub-batches: overview+members → classes+check-ins → billing → reports → settings |
| **B4 Kiosk + embeds** | `/checkin`, `/tv` pinned-dark layouts; embeds + `/unsubscribe` on-brand light components |
| **B5 Portal + emails** | Dunning portal gets a real UI (today: raw JSON from `src/app/portal/[token]/route.ts`); email templates (`src/lib/email.ts`) restyled on light palette |

## 7. Testing & verification

- Existing CI gates unchanged: `npm run lint`, `npm run type-check`, `npm run test` (current coverage thresholds).
- New unit tests: theme resolution (localStorage → system fallback → default), primitive variant rendering.
- Per batch: all gates green + visual pass of affected pages in **both** themes.
- B2 additionally: phone-width (375px) visual check.
- Keyboard-only navigation pass: auth pages + one dashboard page.
- Contrast verified once, at token-definition time (tokens are the only color source).

## 8. Non-goals

- No new features, no information-architecture or navigation-structure changes, no copy rewrites — same pages, same flows, new system.
- No per-account theme persistence (revisit only if users ask).
- No Storybook or visual-regression infrastructure in this pass.

## 9. Artifacts

Brainstorm mockups (style options, light/dark pairings, serif candidates, full design sheet) live in `.superpowers/brainstorm/33606-1781208064/content/` (gitignored, session-local). The token tables above are the canonical record.
