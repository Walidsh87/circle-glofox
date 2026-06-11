# UI Redesign B0+B1 — Foundations & Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Ivory & Lime" design-system foundations (themeable semantic tokens, Fraunces typography, no-flash theme switching) and the shared component library (`ui/` + `shell/`), per `docs/superpowers/specs/2026-06-12-ui-redesign-design.md` batches B0 and B1.

**Architecture:** All colors become CSS variables defined twice — under `[data-theme='light']` and `[data-theme='dark']` on `<html>` — and are exposed to components as Tailwind semantic utilities (`bg-surface`, `text-ink-2`, `border-line`). Components never use `dark:` variants; the variables swap underneath them. Legacy `--c-*`/`--circle-*` vars keep their current literal dark values so the ~140 unmigrated inline-styled files render exactly as today until batches B2–B5 replace them; the dashboard subtree is pinned dark via a `.theme-dark` scope until B3 completes.

**Tech Stack:** Next.js 16 App Router, React 18, Tailwind 3.4, cva + clsx + tailwind-merge (installed), lucide-react (installed), Vitest 4 + @testing-library/react + jsdom (testing-library/jsdom added in Task 1).

**Spec deviations (intentional):**
- `Dialog` and `Tabs` are deferred to the B3 plan — they have no consumer until dashboard migration, and they'll be generated with the shadcn CLI against real call sites (YAGNI).
- `ThemeToggle` is **built and tested** here, but mounted in the sidebar only at the end of B3 (the dashboard is pinned dark until then; a toggle that visibly does nothing inside the dashboard would look broken).
- `Select` is a styled native `<select>` — accessible by default, no Base UI dependency risk.
- Mobile bottom-nav labels are 11px (icon-paired microlabels; the spec's 12px minimum applies to copy).
- `MobileNav` stays inside `sidebar.tsx` (it lives there today and shares the nav data); it splits into `shell/mobile-nav.tsx` only if B3 gives it independent behavior.

**Critical constraints (read before executing):**
1. **CSS var collisions:** old shadcn vars (`--border: 0 0% 18%`, `--accent: 0 0% 14%`…) are HSL triples consumed as `hsl(var(--border))` via `tailwind.config.ts` and `src/components/ui/button.tsx`. Task 3 deletes the old vars, the old Tailwind color mappings, and rewrites `button.tsx` **in one atomic commit** — partial application breaks every border in the app. New token names avoid reuse: `--line` (not `--border`); `--accent` is redefined as a hex only after the HSL consumers are gone (same commit).
2. **Button API stability:** `ui/button.tsx` keeps its existing variant names (`default`, `outline`, `secondary`, `ghost`, `destructive`, `link`) — 4 files import it today and must not change in this plan.
3. **Sidebar API stability:** `shell` rewrite keeps the exact `Sidebar` props (`active`, `userName`, `userRole`, `boxName`) and nav data — ~48 dashboard pages render it.
4. **Legacy keep-list (do NOT delete in this plan):** `--c-*` vars, `--circle-*` vars, `.circle-dark` scope, `.circle-mark` CSS class, `.mono` class, `.c-sidebar`/`.c-mobile-nav`/`.c-scroll-area`/`.c-page-header` responsive rules, all `c-*` keyframes. They die with their consumers in B2–B5.
5. This repo's working tree has a history of mid-session mutations (iCloud sync). Commit after every task; re-read files before editing if a step fails unexpectedly.

---

## File structure

```
Create:
  src/lib/theme.ts                      # Theme type, storage key, resolveTheme(), themeInitScript
  src/lib/theme.test.ts                 # node-env unit tests
  src/components/ui/theme-toggle.tsx    # client toggle button
  src/components/ui/theme-toggle.test.tsx
  src/components/ui/button.test.tsx
  src/components/ui/badge.tsx
  src/components/ui/badge.test.tsx
  src/components/ui/field.tsx           # Field (label+input+error), Select
  src/components/ui/field.test.tsx
  src/components/ui/card.tsx            # Card, StatCard
  src/components/ui/table.tsx           # Table, Th, Td
  src/components/ui/empty-state.tsx
  src/components/ui/skeleton.tsx
  src/components/shell/page-header.tsx
  src/components/shell/page-container.tsx
  src/app/dashboard/loading.tsx
  src/app/[gymSlug]/error.tsx
  src/app/[gymSlug]/loading.tsx
  src/app/join/error.tsx
  src/app/onboarding/error.tsx

Modify:
  vitest.config.ts                      # add @vitejs/plugin-react (already a devDep)
  package.json                          # +jsdom, +@testing-library/react, +@testing-library/dom (Task 1)
  src/app/globals.css                   # new token scopes; delete shadcn HSL block; fix stray lime
  tailwind.config.ts                    # semantic colors + font families, drop shadcn mappings
  src/app/layout.tsx                    # Fraunces in / Bricolage out; theme script; data-theme
  src/components/ui/button.tsx          # restyle on semantic tokens (same API)
  src/components/sidebar.tsx            # next/link, semantic tokens, hover/focus states (same API)
  src/app/dashboard/layout.tsx          # pin subtree dark via .theme-dark wrapper

Do not touch:
  src/app/dashboard/error.tsx           # already exists
  src/components/circle-mark.tsx        # already the canonical logo component
  src/__tests__/setup.ts                # existing test setup, unchanged
```

---

### Task 1: Component-test infrastructure

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `vitest.config.ts`

- [ ] **Step 1: Install jsdom + Testing Library**

Run:
```bash
npm install --save-dev jsdom @testing-library/react @testing-library/dom
```
Expected: exits 0, three packages added to devDependencies.

- [ ] **Step 2: Register the React plugin in vitest config**

`@vitejs/plugin-react` is already a devDependency but unused — without it, `.tsx` test files fail to transform JSX (the project tsconfig uses `"jsx": "preserve"`). Replace the full contents of `vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/_lib/*.ts', 'src/lib/**/*.ts'],
      // supabase/ is client-construction glue (cookies/SSR wiring) — no logic to unit-test.
      exclude: ['src/**/*.test.ts', 'src/lib/supabase/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
})
```

Note: default environment stays `node` (existing tests depend on it). Component tests opt into jsdom per-file with a `// @vitest-environment jsdom` pragma.

- [ ] **Step 3: Verify existing tests still pass**

Run: `npm run test`
Expected: all existing tests PASS, zero failures.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add jsdom + testing-library for component tests"
```

---

### Task 2: Theme resolution module (TDD)

**Files:**
- Create: `src/lib/theme.ts`
- Test: `src/lib/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveTheme, themeInitScript, THEME_STORAGE_KEY } from './theme'

describe('resolveTheme', () => {
  it('honors a stored light preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('honors a stored dark preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('falls back to system preference when nothing stored', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })

  it('ignores junk stored values and uses system preference', () => {
    expect(resolveTheme('banana', true)).toBe('dark')
    expect(resolveTheme('', false)).toBe('light')
  })
})

describe('themeInitScript', () => {
  it('reads the canonical storage key and sets data-theme', () => {
    expect(THEME_STORAGE_KEY).toBe('circle-theme')
    expect(themeInitScript).toContain(THEME_STORAGE_KEY)
    expect(themeInitScript).toContain('data-theme')
    expect(themeInitScript).toContain('prefers-color-scheme: dark')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: FAIL — `Cannot find module './theme'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `src/lib/theme.ts`:

```ts
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'circle-theme'

/**
 * Resolution chain per spec §4: localStorage -> system preference -> light.
 * (matchMedia('(prefers-color-scheme: dark)') is false for both "light" and
 * "no preference", so the final fallback to light is implicit.)
 */
export function resolveTheme(stored: string | null, systemPrefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored
  return systemPrefersDark ? 'dark' : 'light'
}

/**
 * Inline pre-paint script — mirrors resolveTheme(). Injected as the first
 * child of <body> in the root layout so the resolved theme is applied before
 * first paint. On error (e.g. localStorage blocked) the SSR default
 * (data-theme="dark" on <html>) is left in place.
 */
export const themeInitScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=(s==='light'||s==='dark')?s:(d?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})()`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts
git commit -m "feat(theme): resolveTheme + pre-paint init script"
```

---

### Task 3: Foundation swap — tokens, Tailwind, fonts, Button (one atomic commit)

This task replaces the color/font foundations. The four files MUST land in a single commit (see Critical constraint 1).

**Files:**
- Modify: `src/app/globals.css` (full replacement below)
- Modify: `tailwind.config.ts` (full replacement below)
- Modify: `src/app/layout.tsx` (full replacement below)
- Modify: `src/components/ui/button.tsx` (full replacement below)
- Test: `src/components/ui/button.test.tsx`

- [ ] **Step 1: Write the failing Button test**

Create `src/components/ui/button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it('renders the lime primary fill by default', () => {
    render(<Button>Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.className).toContain('bg-accent')
    expect(btn.className).toContain('text-accent-contrast')
  })

  it('renders the danger fill for destructive', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-danger')
  })

  it('keeps a visible focus ring class', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('focus-visible:ring-2')
  })

  it('passes through disabled', () => {
    render(<Button disabled>Nope</Button>)
    expect((screen.getByRole('button', { name: 'Nope' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
```

Note: plain property assertion — `@testing-library/jest-dom` (which provides `toBeDisabled`) is intentionally not installed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/button.test.tsx`
Expected: FAIL — assertions on `bg-accent` / `text-accent-contrast` (current Button renders `bg-primary`).

- [ ] **Step 3: Replace `src/app/globals.css` in full**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
  .member-link:hover {
    color: var(--circle-lime-ink) !important;
  }
}

/* ── Mobile responsive (legacy chrome classes — consumed until B3) ── */
@media (max-width: 768px) {
  .c-sidebar          { display: none !important; }
  .c-mobile-nav       { display: flex !important; }
  .c-scroll-area      { padding: 16px !important; padding-bottom: 80px !important; }
  .c-page-header      { padding: 0 16px !important; }
}

@media (min-width: 769px) {
  .c-mobile-nav       { display: none !important; }
}

@layer base {
  /* ── Ivory & Lime semantic tokens (spec: 2026-06-12-ui-redesign-design.md §3.1) ──
     Components reference ONLY these via Tailwind utilities. Never raw hex. */
  [data-theme='light'] {
    --bg: #F6F4ED;
    --surface: #FFFFFF;
    --surface-2: #FBFAF5;
    --line: #E3DFD2;
    --line-strong: #D8D4C4;
    --ink: #15150F;
    --ink-2: #6B6757;
    --ink-3: #8A8674;
    --ink-faint: #B5B1A0;
    --accent: #C8F135;
    --accent-hover: #BBE32B;
    --accent-ink: #5C7A00;
    --accent-contrast: #15150F;
    --accent-soft: rgba(200, 241, 53, 0.30);
    --ok: #4A6300;
    --ok-soft: rgba(92, 122, 0, 0.12);
    --warn: #92400E;
    --warn-soft: rgba(180, 83, 9, 0.12);
    --danger: #B3261E;
    --danger-soft: rgba(179, 38, 30, 0.10);
    --shadow-sm: 0 1px 3px rgba(21, 21, 15, 0.08);
    --shadow-md: 0 4px 14px rgba(21, 21, 15, 0.10);
  }

  /* .theme-dark pins a subtree dark regardless of the html attribute —
     used by the dashboard until B3 migrates its content. */
  [data-theme='dark'],
  .theme-dark {
    --bg: #0F0F0F;
    --surface: #1A1A1A;
    --surface-2: #141414;
    --line: #262626;
    --line-strong: #333333;
    --ink: #F0F0F0;
    --ink-2: #B0B0B0;
    --ink-3: #888888;
    --ink-faint: #5A5A5A;
    --accent: #C8F135;
    --accent-hover: #b6dd2a;
    --accent-ink: #C8F135;
    --accent-contrast: #0F0F0F;
    --accent-soft: rgba(200, 241, 53, 0.12);
    --ok: #4ADE80;
    --ok-soft: rgba(74, 222, 128, 0.12);
    --warn: #FACC15;
    --warn-soft: rgba(250, 204, 21, 0.13);
    --danger: #FF6B61;
    --danger-soft: rgba(255, 107, 97, 0.12);
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
    --shadow-md: 0 4px 14px rgba(0, 0, 0, 0.5);
  }

  :root {
    /* ── LEGACY tokens — consumed by unmigrated inline-styled pages.
       Values are frozen at today's dark theme so old pages look unchanged
       in either mode. Removed batch-by-batch in B2–B5. ── */
    --circle-lime: #C8F135;
    --circle-lime-hover: #b6dd2a;
    --circle-lime-soft: rgba(200, 241, 53, 0.12);
    --circle-lime-ink: #C8F135;
    --circle-ink: #0A0A0A;
    --circle-steel: #B0B0B0;

    --c-bg: #0F0F0F;
    --c-surface: #1A1A1A;
    --c-surface-alt: #1D1D1D;
    --c-surface-sunk: #131313;
    --c-border: rgba(255, 255, 255, 0.08);
    --c-border-strong: rgba(255, 255, 255, 0.14);
    --c-divider: rgba(255, 255, 255, 0.06);

    --c-ink: #F0F0F0;
    --c-ink-2: #C8C8C8;
    --c-ink-muted: #888888;
    --c-ink-faint: #5A5A5A;

    --c-ok: #4ADE80;
    --c-ok-soft: rgba(74, 222, 128, 0.12);
    --c-ok-ink: #4ADE80;
    --c-warn: #FACC15;
    --c-warn-soft: rgba(250, 204, 21, 0.13);
    --c-warn-ink: #FACC15;
    --c-danger: #F87171;
    --c-danger-soft: rgba(248, 113, 113, 0.13);
    --c-danger-ink: #F87171;

    --c-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
    --c-shadow-md: 0 4px 14px rgba(0, 0, 0, 0.5);

    /* Bricolage retired — legacy inline references to the old display var
       now render Fraunces (transitional look until pages migrate). */
    --font-space-grotesk: var(--font-fraunces);
  }

  * {
    border-color: var(--line);
  }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: var(--font-hanken), ui-sans-serif, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    letter-spacing: -0.005em;
  }
}

/* Circle dark scope — whiteboard (legacy, consumed until B3) */
.circle-dark {
  --c-bg: #0A0A0A;
  --c-surface: #141414;
  --c-surface-alt: #1C1C1C;
  --c-surface-sunk: #0F0F0F;
  --c-border: #262626;
  --c-border-strong: #383838;
  --c-divider: #1F1F1F;
  --c-ink: #FAFAFA;
  --c-ink-2: #D4D4D4;
  --c-ink-muted: #888888;
  --c-ink-faint: #5A5A5A;
  --c-ok-soft: oklch(0.30 0.08 148);
  --c-warn-soft: oklch(0.30 0.10 82);
  --c-danger-soft: oklch(0.30 0.10 28);
  color: var(--c-ink);
  background: var(--c-bg);
}

/* Circle logo mark — legacy CSS version (consumed until B3; CircleMark
   component in src/components/circle-mark.tsx is canonical) */
.circle-mark {
  width: 22px;
  height: 22px;
  position: relative;
  flex-shrink: 0;
  display: inline-block;
}
.circle-mark::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid var(--circle-lime);
  box-sizing: border-box;
}
.circle-mark::after {
  content: '';
  position: absolute;
  left: 50%;
  top: -10%;
  width: 14%;
  height: 120%;
  background: var(--circle-steel);
  transform: translateX(-50%) rotate(20deg);
  transform-origin: center;
}
.circle-mark-on-dark::before {
  border-color: var(--circle-lime);
}

/* Mono numbers */
.mono, [data-mono] {
  font-family: var(--font-geist-mono), ui-monospace, monospace;
  font-feature-settings: "tnum" 1, "zero" 1;
}

/* Motion — prefers-reduced-motion kills all durations */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}

/* Motion tokens */
:root {
  --t-fast: 120ms;
  --t-med: 200ms;
  --t-slow: 320ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.2, 0.4, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
}

/* Live indicator — Whiteboard breathing pulse (stray #C0E050 lime removed per spec §3.1) */
@keyframes c-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--accent), 0 0 12px var(--accent); opacity: 1; }
  50%       { box-shadow: 0 0 0 6px rgba(200, 241, 53, 0); opacity: 0.85; }
}
.c-pulse { animation: c-pulse 2.2s ease-in-out infinite; }

/* Working-athlete dot */
@keyframes c-breathe {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.85); }
}
.c-breathe { animation: c-breathe 1.6s ease-in-out infinite; }

/* Stage enter — opacity + 8px translate + blur */
@keyframes c-stage-in {
  from { opacity: 0; transform: translateY(8px); filter: blur(4px); }
  to   { opacity: 1; transform: translateY(0);   filter: blur(0); }
}
.c-stage-in { animation: c-stage-in 360ms cubic-bezier(0.34, 1.2, 0.4, 1) both; }

/* Stage exit */
@keyframes c-stage-out {
  from { opacity: 1; transform: translateY(0);   filter: blur(0); }
  to   { opacity: 0; transform: translateY(-4px); filter: blur(4px); }
}
.c-stage-out { animation: c-stage-out 200ms cubic-bezier(0.4, 0, 1, 1) both; }

/* Soft fade-up for row appearance */
@keyframes c-fade-up {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.c-fade-up { animation: c-fade-up 240ms cubic-bezier(0.16, 1, 0.3, 1) both; }

/* PR celebration glow (stray #C0E050 lime removed per spec §3.1) */
@keyframes c-pr {
  0%   { box-shadow: 0 0 0 0 var(--accent), 0 0 0 0 var(--accent); }
  60%  { box-shadow: 0 0 0 8px rgba(200, 241, 53, 0.35), 0 0 24px rgba(200, 241, 53, 0.4); }
  100% { box-shadow: 0 0 0 0 rgba(200, 241, 53, 0), 0 0 0 0 rgba(200, 241, 53, 0); }
}
.c-pr { animation: c-pr 1.4s ease-out; }
```

- [ ] **Step 4: Replace `tailwind.config.ts` in full**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-hanken)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        canvas: "var(--bg)",
        surface: { DEFAULT: "var(--surface)", 2: "var(--surface-2)" },
        line: { DEFAULT: "var(--line)", strong: "var(--line-strong)" },
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
          faint: "var(--ink-faint)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          ink: "var(--accent-ink)",
          contrast: "var(--accent-contrast)",
          soft: "var(--accent-soft)",
        },
        ok: { DEFAULT: "var(--ok)", soft: "var(--ok-soft)" },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" },
      },
      boxShadow: {
        card: "var(--shadow-sm)",
        pop: "var(--shadow-md)",
      },
    },
  },
  plugins: [],
};
export default config;
```

Notes: `darkMode` key removed (no `dark:` variants in this system, spec §4). Spec token `bg` maps to the `canvas` utility name (`bg-bg` is unreadable); `border` maps to `line` (avoids the `--border` HSL collision). Radii use Tailwind built-ins: `rounded-xl` = 12px cards, `rounded-lg` = 8px controls, `rounded-full` = pills (spec §3.3).

- [ ] **Step 5: Replace `src/app/layout.tsx` in full**

```tsx
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Fraunces, Hanken_Grotesk } from 'next/font/google'
import { themeInitScript } from '@/lib/theme'
import './globals.css'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
})
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz'],
})
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Circle',
  description: 'Gym management platform',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Circle' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // data-theme="dark" is the SSR/no-JS default (today's look); the inline
    // script corrects it pre-paint. suppressHydrationWarning covers the
    // intentional server/client attribute mismatch on <html> only.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${hanken.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  )
}
```

Note: `Fraunces` is a variable font — no `weight` prop means the full variable range is loaded; `axes: ['opsz']` includes the optical-size axis (spec §3.2).

- [ ] **Step 6: Replace `src/components/ui/button.tsx` in full**

Variant names are unchanged (4 existing importers); only the classes move to semantic tokens.

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-contrast hover:bg-accent-hover",
        outline: "border border-line-strong bg-transparent text-ink hover:bg-surface-2",
        secondary: "bg-surface-2 text-ink border border-line hover:border-line-strong",
        ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
        destructive: "bg-danger text-white hover:opacity-90",
        link: "text-accent-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-12 px-8",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

Note: `h-11` (44px) default height meets the spec's touch-target minimum (§5.1).

- [ ] **Step 7: Verify**

Run, in order:
```bash
npx vitest run src/components/ui/button.test.tsx                                    # PASS, 4 tests
npm run type-check                                                                   # 0 errors
npm run test                                                                         # all green
grep -n "hsl(var(" src/app/globals.css tailwind.config.ts src/components/ui/button.tsx  # NO matches (HSL system gone)
npm run build                                                                        # compiles successfully
```

- [ ] **Step 8: Visual smoke test**

Run `npm run dev`, open `http://localhost:3000`:
- Root login renders as today (dark — legacy vars), but headings render in **Fraunces serif** (via the `--font-space-grotesk` alias).
- In browser devtools console: `document.documentElement.setAttribute('data-theme','light')` — the page *background does not change* (root page uses legacy `--c-*` literals; this is correct coexistence behavior). No console errors.
- Open `/dashboard` (sign in) — renders as today, no layout breakage.
- Known + accepted: the two older dashboard forms styled with the deleted shadcn classes (`bg-primary` etc.) lose their colors until B3 migrates them — Tailwind simply no longer generates those classes. Functionality is unaffected.

- [ ] **Step 9: Commit (atomic)**

```bash
git add src/app/globals.css tailwind.config.ts src/app/layout.tsx src/components/ui/button.tsx src/components/ui/button.test.tsx
git commit -m "feat(design): Ivory & Lime tokens, Fraunces, semantic Tailwind, restyled Button (B0)"
```

---

### Task 4: ThemeToggle (TDD)

**Files:**
- Create: `src/components/ui/theme-toggle.tsx`
- Test: `src/components/ui/theme-toggle.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/theme-toggle.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './theme-toggle'
import { THEME_STORAGE_KEY } from '@/lib/theme'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.setAttribute('data-theme', 'dark')
  })

  it('switches the html attribute and persists the choice', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('toggles back to dark on second click', () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('has an accessible label', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/mode/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/theme-toggle.test.tsx`
Expected: FAIL — cannot resolve `./theme-toggle`.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/theme-toggle.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme'

export function ThemeToggle() {
  // null until mounted — the server can't know the resolved theme.
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    setTheme(current === 'light' ? 'light' : 'dark')
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // storage blocked (private mode) — theme still switches for this page
    }
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/theme-toggle.test.tsx`
Expected: PASS, 3 tests. (jsdom mounts effects synchronously under `render`; the pre-click state is `dark` per `beforeEach`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/theme-toggle.tsx src/components/ui/theme-toggle.test.tsx
git commit -m "feat(ui): ThemeToggle (mounted in shell at end of B3)"
```

---

### Task 5: Badge (TDD)

**Files:**
- Create: `src/components/ui/badge.tsx`
- Test: `src/components/ui/badge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/badge.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './badge'

describe('Badge', () => {
  it('renders neutral by default', () => {
    render(<Badge>Trial</Badge>)
    expect(screen.getByText('Trial').className).toContain('bg-surface-2')
  })

  it('renders status tones', () => {
    render(<Badge tone="ok">Active</Badge>)
    expect(screen.getByText('Active').className).toContain('bg-ok-soft')
    render(<Badge tone="danger">Dunning</Badge>)
    expect(screen.getByText('Dunning').className).toContain('bg-danger-soft')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ui/badge.test.tsx`
Expected: FAIL — cannot resolve `./badge`.

- [ ] **Step 3: Implement**

Create `src/components/ui/badge.tsx`:

```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
  {
    variants: {
      tone: {
        ok: 'bg-ok-soft text-ok',
        warn: 'bg-warn-soft text-warn',
        danger: 'bg-danger-soft text-danger',
        accent: 'bg-accent-soft text-accent-ink',
        neutral: 'bg-surface-2 text-ink-2 border border-line',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ tone, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/ui/badge.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/badge.test.tsx
git commit -m "feat(ui): Badge with status tones"
```

---

### Task 6: Field + Select (TDD)

**Files:**
- Create: `src/components/ui/field.tsx`
- Test: `src/components/ui/field.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/field.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field, Select } from './field'

describe('Field', () => {
  it('associates the label with the input', () => {
    render(<Field label="Email" type="email" />)
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('wires the error to the input via aria-describedby and announces it', () => {
    render(<Field label="Email" error="Invalid email address." />)
    const input = screen.getByLabelText('Email')
    const error = screen.getByRole('alert')
    expect(error.textContent).toBe('Invalid email address.')
    expect(input.getAttribute('aria-describedby')).toBe(error.id)
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('shows no alert when there is no error', () => {
    render(<Field label="Email" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Select', () => {
  it('renders a native select with its options', () => {
    render(
      <Select aria-label="Role">
        <option value="coach">Coach</option>
        <option value="owner">Owner</option>
      </Select>
    )
    expect(screen.getByLabelText('Role').tagName).toBe('SELECT')
    expect(screen.getByText('Owner')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ui/field.test.tsx`
Expected: FAIL — cannot resolve `./field`.

- [ ] **Step 3: Implement**

Create `src/components/ui/field.tsx`:

```tsx
'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const controlClasses =
  'h-11 w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string | null
  hint?: string
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    const autoId = React.useId()
    const inputId = id ?? autoId
    const errorId = `${inputId}-error`
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-xs font-medium text-ink-2">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(controlClasses, error ? 'border-danger' : 'border-line-strong', className)}
          {...props}
        />
        {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    )
  }
)
Field.displayName = 'Field'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  return (
    <span className="relative inline-flex w-full">
      <select
        ref={ref}
        className={cn(controlClasses, 'appearance-none border-line-strong pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
      />
    </span>
  )
})
Select.displayName = 'Select'
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/ui/field.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/field.tsx src/components/ui/field.test.tsx
git commit -m "feat(ui): Field with accessible errors + native Select"
```

---

### Task 7: Card + StatCard

**Files:**
- Create: `src/components/ui/card.tsx`

- [ ] **Step 1: Implement** (presentational only — visual verification in Task 12; no unit test)

Create `src/components/ui/card.tsx`:

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-line bg-surface shadow-card', className)}
      {...props}
    />
  )
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
  className,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  tone?: 'up' | 'down' | 'neutral'
  className?: string
}) {
  const toneClass =
    tone === 'up' ? 'text-accent-ink' : tone === 'down' ? 'text-danger' : 'text-ink-3'
  return (
    <Card className={cn('p-4', className)}>
      <div className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-ink">{value}</div>
      {sub && <div className={cn('mt-0.5 text-xs font-semibold', toneClass)}>{sub}</div>}
    </Card>
  )
}
```

- [ ] **Step 2: Verify compile**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat(ui): Card + StatCard"
```

---

### Task 8: Table, EmptyState, Skeleton

**Files:**
- Create: `src/components/ui/table.tsx`
- Create: `src/components/ui/empty-state.tsx`
- Create: `src/components/ui/skeleton.tsx`

- [ ] **Step 1: Implement Table** — create `src/components/ui/table.tsx`:

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  )
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-b border-line px-3 py-2.5 text-left font-mono text-xs font-medium uppercase tracking-[0.1em] text-ink-3',
        className
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line px-3 py-2.5 text-ink', className)} {...props} />
}
```

- [ ] **Step 2: Implement EmptyState** — create `src/components/ui/empty-state.tsx`:

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string
  body?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-6 py-12 text-center',
        className
      )}
    >
      <div className="font-display text-lg font-semibold text-ink">{title}</div>
      {body && <p className="max-w-sm text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Implement Skeleton** — create `src/components/ui/skeleton.tsx`:

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-surface-2', className)}
      {...props}
    />
  )
}
```

- [ ] **Step 4: Verify compile**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/table.tsx src/components/ui/empty-state.tsx src/components/ui/skeleton.tsx
git commit -m "feat(ui): Table primitives, EmptyState, Skeleton"
```

---

### Task 9: Shell — PageHeader + PageContainer

**Files:**
- Create: `src/components/shell/page-header.tsx`
- Create: `src/components/shell/page-container.tsx`

- [ ] **Step 1: Implement PageHeader** — create `src/components/shell/page-header.tsx`:

```tsx
import * as React from 'react'

export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string
  title: string
  actions?: React.ReactNode
}) {
  return (
    <div className="c-page-header flex items-end justify-between gap-4 pb-5">
      <div>
        {eyebrow && (
          <div className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3">{eyebrow}</div>
        )}
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Implement PageContainer** — create `src/components/shell/page-container.tsx`:

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Standard scrollable page body. Includes the bottom-nav safe-area padding
 * that 15 dashboard pages currently miss; the legacy `c-scroll-area` class
 * keeps the existing mobile media-query overrides working until B3.
 */
export function PageContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <main
      className={cn(
        'c-scroll-area min-h-screen flex-1 overflow-y-auto bg-canvas p-6 pb-24 md:pb-8',
        className
      )}
      {...props}
    />
  )
}
```

- [ ] **Step 3: Verify compile**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/page-header.tsx src/components/shell/page-container.tsx
git commit -m "feat(shell): PageHeader + PageContainer"
```

---

### Task 10: Shell — Sidebar rewrite (next/link + tokens + hover/focus)

**Files:**
- Modify: `src/components/sidebar.tsx` (full replacement below)

The props API (`active`, `userName`, `userRole`, `boxName`), nav data, role gating, and icon set are IDENTICAL to the current file — only the rendering changes: `<a href>` → `next/link` (ends full-page reloads), inline styles → semantic Tailwind classes, real hover/focus states, Fraunces wordmark.

- [ ] **Step 1: Replace `src/components/sidebar.tsx` in full**

Keep lines 1–118 of the current file (imports, `NavItem`/`NavGroup` types, `getNavGroups()`, `initials()`, `ICON_PATHS`, `CIcon`) **unchanged, except**:
- Add `import Link from 'next/link'` after the existing imports.
- Add `import { cn } from '@/lib/utils'` after the existing imports.

Then replace the entire `export function Sidebar(...)` (current lines 121–299) with:

```tsx
export function Sidebar({
  active,
  userName,
  userRole,
  boxName,
}: {
  active: string
  userName: string | null
  userRole: string
  boxName: string
}) {
  const router = useRouter()
  const groups = getNavGroups(userRole)
  const userInitials = initials(userName)
  const boxInitial = boxName ? boxName[0].toUpperCase() : 'C'

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  // Flatten nav items for mobile bottom bar (first 4 most relevant)
  const allItems = groups.flatMap((g) => g.items)
  const mobileItems = allItems.slice(0, 4)

  return (
    <>
      <aside className="c-sidebar flex h-screen w-[248px] shrink-0 flex-col gap-[18px] overflow-y-auto border-r border-line bg-surface-2 px-3.5 py-5">
        {/* Logo */}
        <div className="flex items-center justify-between px-1.5">
          <div className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
            <CircleMark size={20} />
            <span>Circle</span>
          </div>
          <span className="mono rounded border border-line px-1.5 py-px text-[10px] text-ink-3">
            v1.0
          </span>
        </div>

        {/* Gym card */}
        <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface p-2 shadow-card">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#0A0A0A] font-display text-[13px] font-bold text-[#C8F135]">
            {boxInitial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">
              {boxName || 'My Gym'}
            </div>
            <div className="mono text-xs capitalize text-ink-3">{userRole}</div>
          </div>
        </div>

        {/* Nav groups */}
        {groups.map((group) => (
          <div key={group.section} className="flex flex-col gap-0.5">
            <div className="mono px-2.5 pb-1.5 pt-0.5 text-xs uppercase tracking-[0.1em] text-ink-3">
              {group.section}
            </div>
            {group.items.map((item) => {
              const on = item.key === active
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-2.5 py-[7px] text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    on
                      ? 'border-line bg-surface font-semibold text-ink shadow-card'
                      : 'border-transparent font-medium text-ink-2 hover:bg-surface hover:text-ink'
                  )}
                >
                  <CIcon name={item.icon} size={15} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        'mono rounded px-1 py-px text-[10px] font-semibold',
                        item.badgeVariant === 'lime'
                          ? 'bg-accent-soft text-accent-ink'
                          : 'bg-danger-soft text-danger'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}

        {/* User footer */}
        <div className="mt-auto flex items-center gap-2.5 border-t border-line pt-3">
          <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-contrast">
            {userInitials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-ink">{userName}</div>
            <div className="mono text-xs capitalize text-ink-3">{userRole}</div>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="rounded-md px-1.5 py-1 text-xs text-ink-3 transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="c-mobile-nav fixed inset-x-0 bottom-0 z-50 items-center justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom,8px)] pt-2">
        {mobileItems.map((item) => {
          const on = item.key === active
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-[3px] rounded-lg px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                on ? 'text-accent-ink' : 'text-ink-3'
              )}
            >
              <CIcon name={item.icon} size={22} />
              <span className={cn('text-[11px]', on ? 'font-bold' : 'font-medium')}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npm run type-check    # 0 errors
npm run lint          # 0 errors
```

- [ ] **Step 3: Visual smoke test**

`npm run dev`, sign in, open `/dashboard`:
- Sidebar renders dark (inside the soon-to-be-pinned dashboard; until Task 11 it follows the html attribute, which defaults dark).
- Hovering an inactive nav item shows a surface highlight (this never worked before).
- Tab key shows a lime focus ring on nav items.
- Clicking between two nav pages does NOT trigger a full page reload (network tab: no full document fetch).
- Narrow the window below 768px: bottom nav shows, sidebar hides.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(shell): sidebar on next/link + semantic tokens + hover/focus states"
```

---

### Task 11: Pin the dashboard dark until B3

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Wrap the layout's children in the `.theme-dark` scope**

In `src/app/dashboard/layout.tsx`: rename the existing default export function from `DashboardLayout` to `WaiverGate` (it has four `return <>{children}</>` sites — leave them all untouched), remove `export default` from it, and add this new default export above it:

```tsx
// Pinned dark until B3 migrates dashboard content (spec §6 — coexistence).
// display:contents keeps the wrapper out of layout; CSS vars still cascade.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-dark" style={{ display: 'contents' }}>
      <WaiverGate>{children}</WaiverGate>
    </div>
  )
}

async function WaiverGate({ children }: { children: React.ReactNode }) {
  // ... existing body of the old DashboardLayout, unchanged ...
}
```

- [ ] **Step 2: Verify**

```bash
npm run type-check   # 0 errors
```
Then `npm run dev`, open `/dashboard`, and in the console run `document.documentElement.setAttribute('data-theme','light')` — the dashboard (including the new sidebar) must stay fully dark.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat(dashboard): pin subtree dark via .theme-dark until B3"
```

---

### Task 12: Route-group loading + error boundaries

**Files:**
- Create: `src/app/dashboard/loading.tsx`
- Create: `src/app/[gymSlug]/error.tsx`
- Create: `src/app/[gymSlug]/loading.tsx`
- Create: `src/app/join/error.tsx`
- Create: `src/app/onboarding/error.tsx`

Note: `src/app/dashboard/error.tsx` already exists — do not touch it.

- [ ] **Step 1: Dashboard loading skeleton** — create `src/app/dashboard/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
```

- [ ] **Step 2: Error boundaries** — create `src/app/[gymSlug]/error.tsx`, `src/app/join/error.tsx`, and `src/app/onboarding/error.tsx`, each with this exact content (three identical files — route boundaries cannot be shared via import of a default export with `'use client'` pragma reliably across segments, and three small copies beat a premature abstraction):

```tsx
'use client'

import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="max-w-md text-sm text-ink-2">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
```

- [ ] **Step 3: Gym page loading** — create `src/app/[gymSlug]/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function GymLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify**

```bash
npm run type-check   # 0 errors
npm run lint         # 0 errors
```

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/loading.tsx "src/app/[gymSlug]/error.tsx" "src/app/[gymSlug]/loading.tsx" src/app/join/error.tsx src/app/onboarding/error.tsx
git commit -m "feat(app): loading skeletons + error boundaries for major route groups"
```

---

### Task 13: Final verification

- [ ] **Step 1: Full gate run**

```bash
npm run lint           # 0 errors
npm run type-check     # 0 errors
npm run test           # all tests pass (existing + 18 new: theme 5, button 4, toggle 3, badge 2, field 4)
npm run test:coverage  # thresholds pass (lines 70 / functions 70 / branches 60 / statements 70)
npm run build          # production build succeeds
```

- [ ] **Step 2: Visual pass (both themes)**

`npm run dev`, then verify:
1. `/` (root login): renders dark, Fraunces headlines, no console errors. Set `data-theme='light'` via console → page body stays legacy-dark (correct until B2), no errors.
2. `/dashboard`: fully dark in both html-attribute states (pinned), new sidebar with hover/focus, client-side nav between pages, loading skeleton flashes on slow routes.
3. Phone width (375px): dashboard bottom nav appears with 11px labels.
4. Fonts: confirm Fraunces loads (devtools → Network → fonts; or inspect an h1 — computed font-family shows Fraunces).

- [ ] **Step 3: Commit any stragglers and report**

```bash
git status   # should be clean; commit anything missed with an appropriate message
```

Report completion against spec §6 batch table: B0 ✅, B1 ✅ (Dialog/Tabs + ThemeToggle mount deferred to B3 plan, documented above).

---

## What this plan does NOT do (next plans)

- **B2 plan** — member-facing pages (`/`, `/[gymSlug]`, `/join`, `/onboarding`) rebuilt mobile-first on these primitives.
- **B3 plan** — dashboard route groups migrated in 5 sub-batches; Dialog/Tabs generated via shadcn CLI at first consumer; ThemeToggle mounted in sidebar; `.theme-dark` pin removed; legacy chrome classes (`c-sidebar` etc.) deleted; `TIMEZONE_OFFSETS` (duplicated in ~9 dashboard files) consolidated into one module as those files are touched (spec §5.3).
- **B4 plan** — kiosk pinned-dark layouts, embeds, unsubscribe.
- **B5 plan** — dunning portal UI, email templates, final legacy-token deletion (`--c-*`, `--circle-*`, `.circle-mark`, `.circle-dark`).
