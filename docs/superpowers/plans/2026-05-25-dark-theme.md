# Dark Theme Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the Circle Glofox app from a light warm-white theme to a premium dark theme matching the [GYM].html design system (near-black backgrounds, electric lime accent, dark surfaces).

**Architecture:** Replace all `:root` CSS custom property values in `globals.css` with dark equivalents. Fix two dashboard components that use `var(--circle-ink)` (`#0A0A0A`) as an accent card background — invisible on the now-dark global background. No structural changes to any page.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, shadcn/ui, inline CSS variables throughout

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/app/globals.css` | Modify | All `:root` token values (shadcn + Circle brand + surfaces + text + status + shadows) |
| `src/app/dashboard/page.tsx` | Modify | WOD hero bg + Accent NavCard bg (2 spots) |

---

## Task 1: Update CSS tokens in globals.css

**Files:**
- Modify: `src/app/globals.css:27-87`

This is the core of the dark switch. Replace the entire `:root { }` block inside `@layer base` with dark values. The structure stays exactly the same — only the values change.

- [ ] **Step 1.1: Replace the `:root` block in `@layer base`**

Open `src/app/globals.css`. Find the `@layer base { :root { ... } }` block (lines 26–88). Replace the entire inner `:root { ... }` contents with:

```css
    /* shadcn/ui tokens — dark equivalents */
    --background: 0 0% 6%;
    --foreground: 0 0% 94%;
    --card: 0 0% 10%;
    --card-foreground: 0 0% 94%;
    --popover: 0 0% 14%;
    --popover-foreground: 0 0% 94%;
    --primary: 75 87% 57%;
    --primary-foreground: 0 0% 4%;
    --secondary: 0 0% 14%;
    --secondary-foreground: 0 0% 94%;
    --muted: 0 0% 14%;
    --muted-foreground: 0 0% 53%;
    --accent: 0 0% 14%;
    --accent-foreground: 0 0% 94%;
    --destructive: 0 91% 71%;
    --destructive-foreground: 0 0% 4%;
    --border: 0 0% 18%;
    --input: 0 0% 18%;
    --ring: 75 87% 57%;
    --radius: 0.5rem;

    /* Circle brand */
    --circle-lime: #C8F135;
    --circle-lime-hover: #b6dd2a;
    --circle-lime-soft: rgba(200, 241, 53, 0.12);
    --circle-lime-ink: #C8F135;
    --circle-ink: #0A0A0A;
    --circle-steel: #B0B0B0;

    /* surfaces */
    --c-bg: #0F0F0F;
    --c-surface: #1A1A1A;
    --c-surface-alt: #1D1D1D;
    --c-surface-sunk: #131313;
    --c-border: rgba(255, 255, 255, 0.08);
    --c-border-strong: rgba(255, 255, 255, 0.14);
    --c-divider: rgba(255, 255, 255, 0.06);

    /* text */
    --c-ink: #F0F0F0;
    --c-ink-2: #C8C8C8;
    --c-ink-muted: #888888;
    --c-ink-faint: #5A5A5A;

    /* status */
    --c-ok: #4ADE80;
    --c-ok-soft: rgba(74, 222, 128, 0.12);
    --c-ok-ink: #4ADE80;
    --c-warn: #FACC15;
    --c-warn-soft: rgba(250, 204, 21, 0.13);
    --c-warn-ink: #FACC15;
    --c-danger: #F87171;
    --c-danger-soft: rgba(248, 113, 113, 0.13);
    --c-danger-ink: #F87171;

    /* shadows */
    --c-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
    --c-shadow-md: 0 4px 14px rgba(0, 0, 0, 0.5);
```

The full `@layer base` block after this edit should look like:

```css
@layer base {
  :root {
    /* shadcn/ui tokens — dark equivalents */
    --background: 0 0% 6%;
    --foreground: 0 0% 94%;
    --card: 0 0% 10%;
    --card-foreground: 0 0% 94%;
    --popover: 0 0% 14%;
    --popover-foreground: 0 0% 94%;
    --primary: 75 87% 57%;
    --primary-foreground: 0 0% 4%;
    --secondary: 0 0% 14%;
    --secondary-foreground: 0 0% 94%;
    --muted: 0 0% 14%;
    --muted-foreground: 0 0% 53%;
    --accent: 0 0% 14%;
    --accent-foreground: 0 0% 94%;
    --destructive: 0 91% 71%;
    --destructive-foreground: 0 0% 4%;
    --border: 0 0% 18%;
    --input: 0 0% 18%;
    --ring: 75 87% 57%;
    --radius: 0.5rem;

    /* Circle brand */
    --circle-lime: #C8F135;
    --circle-lime-hover: #b6dd2a;
    --circle-lime-soft: rgba(200, 241, 53, 0.12);
    --circle-lime-ink: #C8F135;
    --circle-ink: #0A0A0A;
    --circle-steel: #B0B0B0;

    /* surfaces */
    --c-bg: #0F0F0F;
    --c-surface: #1A1A1A;
    --c-surface-alt: #1D1D1D;
    --c-surface-sunk: #131313;
    --c-border: rgba(255, 255, 255, 0.08);
    --c-border-strong: rgba(255, 255, 255, 0.14);
    --c-divider: rgba(255, 255, 255, 0.06);

    /* text */
    --c-ink: #F0F0F0;
    --c-ink-2: #C8C8C8;
    --c-ink-muted: #888888;
    --c-ink-faint: #5A5A5A;

    /* status */
    --c-ok: #4ADE80;
    --c-ok-soft: rgba(74, 222, 128, 0.12);
    --c-ok-ink: #4ADE80;
    --c-warn: #FACC15;
    --c-warn-soft: rgba(250, 204, 21, 0.13);
    --c-warn-ink: #FACC15;
    --c-danger: #F87171;
    --c-danger-soft: rgba(248, 113, 113, 0.13);
    --c-danger-ink: #F87171;

    /* shadows */
    --c-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
    --c-shadow-md: 0 4px 14px rgba(0, 0, 0, 0.5);
  }

  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-hanken), ui-sans-serif, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    letter-spacing: -0.005em;
  }
}
```

- [ ] **Step 1.2: Commit the token change**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
git add src/app/globals.css
git commit -m "feat: switch to dark theme — update CSS token values"
```

---

## Task 2: Fix accent card backgrounds in dashboard.tsx

**Files:**
- Modify: `src/app/dashboard/page.tsx`

Two components in `dashboard.tsx` use `var(--circle-ink)` (`#0A0A0A`) as a card background. In the new dark theme, `--c-bg` is `#0F0F0F`, so a `#0A0A0A` card is nearly invisible. Replace with `var(--c-surface-alt)` (`#1D1D1D`) plus a lime tint border for accent.

- [ ] **Step 2.1: Fix the WOD hero card background**

In `src/app/dashboard/page.tsx`, find the WOD hero `<div>` around line 203 that starts:

```tsx
{wod && (
  <div style={{
    background: 'var(--circle-ink)', borderRadius: 14, padding: '22px 24px',
    position: 'relative', overflow: 'hidden', boxShadow: 'var(--c-shadow-md)',
  }}>
```

Change it to:

```tsx
{wod && (
  <div style={{
    background: 'var(--c-surface-alt)', borderRadius: 14, padding: '22px 24px',
    border: '1px solid rgba(200, 241, 53, 0.18)',
    position: 'relative', overflow: 'hidden', boxShadow: 'var(--c-shadow-md)',
  }}>
```

Everything inside this div (lime ring decorations, lime title, lime button) stays unchanged.

- [ ] **Step 2.2: Fix the accent NavCard background and border**

In `src/app/dashboard/page.tsx`, find the `NavCard` component (near line 272). It has:

```tsx
function NavCard({ href, label, description, accent }: {
  href: string; label: string; description: string; accent?: boolean
}) {
  return (
    <a href={href} style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '18px 16px',
      background: accent ? 'var(--circle-ink)' : 'var(--c-surface)',
      border: `1px solid ${accent ? '#222' : 'var(--c-border)'}`,
      borderRadius: 12, textDecoration: 'none',
      boxShadow: 'var(--c-shadow-sm)',
    }}>
```

Change the two accent-conditional values:

```tsx
function NavCard({ href, label, description, accent }: {
  href: string; label: string; description: string; accent?: boolean
}) {
  return (
    <a href={href} style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '18px 16px',
      background: accent ? 'var(--c-surface-alt)' : 'var(--c-surface)',
      border: `1px solid ${accent ? 'rgba(200, 241, 53, 0.25)' : 'var(--c-border)'}`,
      borderRadius: 12, textDecoration: 'none',
      boxShadow: 'var(--c-shadow-sm)',
    }}>
```

The label color (`accent ? 'var(--circle-lime)' : 'var(--c-ink)'`) stays unchanged — lime text still appears.

- [ ] **Step 2.3: Commit the component fixes**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
git add src/app/dashboard/page.tsx
git commit -m "feat: fix accent card backgrounds for dark theme"
```

---

## Task 3: Visual verification

Run the dev server and manually check the key screens. No automated tests — this is a visual change.

- [ ] **Step 3.1: Start the dev server**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
npm run dev
```

Open http://localhost:3000 in a browser. Sign in (use the magic link flow on any gym slug, e.g. `/north-street`).

- [ ] **Step 3.2: Check the global shell**

Navigate to `/dashboard`. Verify:
- [ ] Page background is near-black (~`#0F0F0F`)
- [ ] Sidebar shows dark surface (`#1A1A1A`) with readable white/gray text
- [ ] Active sidebar link shows lime left accent and lime text
- [ ] Sidebar borders are barely-visible (`rgba(255,255,255,0.08)`)
- [ ] User avatar initials: lime background (`#C8F135`), dark text

- [ ] **Step 3.3: Check the Dashboard page**

- [ ] Stat cards render on dark surfaces with readable text
- [ ] WOD hero card: visually distinct from background (dark surface + faint lime border)
- [ ] "Whiteboard" nav card: dark surface-alt with a lime-tinted border
- [ ] Status colors in stat cards (unpaid = yellow, leads = lime) are readable against dark

- [ ] **Step 3.4: Check the Members page**

Navigate to `/dashboard/members`. Verify:
- [ ] Table rows: dark surface, borders barely visible
- [ ] Status badges readable: lime (active), yellow (overdue), red (cancelled)
- [ ] Search input: dark background with white text

- [ ] **Step 3.5: Check the Payments page**

Navigate to `/dashboard/payments`. Verify:
- [ ] Membership rows readable
- [ ] "Paid" / "Unpaid" / "Overdue" status badges use green/yellow/red on dark soft backgrounds

- [ ] **Step 3.6: Check the Whiteboard page**

Navigate to `/dashboard/whiteboard`. Verify:
- [ ] Whiteboard page is slightly deeper black than main app (`.circle-dark` scope sets `--c-bg: #0A0A0A`)
- [ ] Large type, lime accents, athlete grid all readable
- [ ] Live indicator pulse animation still visible

- [ ] **Step 3.7: Check mobile view**

Resize browser to 375px width. Verify:
- [ ] Mobile bottom nav: dark surface background, lime active tab
- [ ] Pages readable at mobile width

- [ ] **Step 3.8: Check shadcn/ui components**

On any page with a Button or Select (e.g. Members page "+ Add Member", Payments page actions):
- [ ] Primary Button: lime background (`#C8F135`) with dark text
- [ ] Select dropdown: dark popover background, white text

---

## Task 4: Lint and type-check

- [ ] **Step 4.1: Run lint**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
npm run lint
```

Expected: 0 errors (the changes are pure CSS and inline-style string values — no TypeScript changes).

- [ ] **Step 4.2: Run type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 4.3: Run tests**

```bash
npm run test
```

Expected: all tests pass (no tests cover CSS tokens or inline styles).
