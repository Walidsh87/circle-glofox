# Dark Theme Switch — Circle Glofox

_Spec date: 2026-05-25_

## Overview

Implement a full dark theme for the Circle Glofox gym management SaaS, matching the premium dark aesthetic from the `[GYM].html` design file. The app currently uses a light warm-white theme; this switches the global color tokens to near-black surfaces with an electric lime accent.

## Source design

`[GYM].html` — a premium dark gym SaaS design (Whoop/Tempo aesthetic):
- Background: `#0F0F0F`, Surface: `#1A1A1A`, Elevated: `#242424`
- Accent: Electric lime `#C8F135`
- Text: `#F0F0F0` primary, `#888888` muted
- Status: `#4ADE80` (ok), `#FACC15` (warn), `#F87171` (danger)

## Approach

**CSS variable swap + targeted fixes** — ~2 files changed.

The existing code uses CSS variables for all colors (`var(--c-bg)`, `var(--c-surface)`, `var(--c-ink)`, etc.). The dark switch is a token replacement in `globals.css`. Three spots in `dashboard.tsx` need targeted fixes where `var(--circle-ink)` is used as a card background.

## Section 1 — CSS tokens (globals.css)

Update the `:root` block with these dark values:

### Surface tokens
| Token | Light value | Dark value |
|---|---|---|
| `--c-bg` | `oklch(0.985 0.003 240)` | `#0F0F0F` |
| `--c-surface` | `#ffffff` | `#1A1A1A` |
| `--c-surface-alt` | `oklch(0.97 0.004 240)` | `#1D1D1D` |
| `--c-surface-sunk` | `oklch(0.955 0.005 240)` | `#131313` |
| `--c-border` | `oklch(0.91 0.006 240)` | `rgba(255,255,255,0.08)` |
| `--c-border-strong` | `oklch(0.82 0.009 240)` | `rgba(255,255,255,0.14)` |
| `--c-divider` | `oklch(0.93 0.005 240)` | `rgba(255,255,255,0.06)` |

### Text tokens
| Token | Light value | Dark value |
|---|---|---|
| `--c-ink` | `oklch(0.18 0.01 60)` | `#F0F0F0` |
| `--c-ink-2` | `oklch(0.32 0.01 60)` | `#C8C8C8` |
| `--c-ink-muted` | `oklch(0.52 0.012 60)` | `#888888` |
| `--c-ink-faint` | `oklch(0.68 0.012 60)` | `#5A5A5A` |

### Lime tokens
| Token | Light value | Dark value |
|---|---|---|
| `--circle-lime` | `#C0E050` | `#C8F135` |
| `--circle-lime-hover` | `#B4D63E` | `#b6dd2a` |
| `--circle-lime-soft` | `oklch(0.96 0.07 122)` | `rgba(200,241,53,0.12)` |
| `--circle-lime-ink` | `oklch(0.42 0.13 122)` | `#C8F135` |

### Status tokens (dark-adapted)
| Token | Dark value |
|---|---|
| `--c-ok` | `#4ADE80` |
| `--c-ok-soft` | `rgba(74,222,128,0.12)` |
| `--c-ok-ink` | `#4ADE80` |
| `--c-warn` | `#FACC15` |
| `--c-warn-soft` | `rgba(250,204,21,0.13)` |
| `--c-warn-ink` | `#FACC15` |
| `--c-danger` | `#F87171` |
| `--c-danger-soft` | `rgba(248,113,113,0.13)` |
| `--c-danger-ink` | `#F87171` |

### Shadow tokens
| Token | Dark value |
|---|---|
| `--c-shadow-sm` | `0 1px 2px rgba(0,0,0,0.4)` |
| `--c-shadow-md` | `0 4px 14px rgba(0,0,0,0.5)` |

### shadcn/ui tokens
Map to dark equivalents so Button, Select, and other shadcn components render correctly:
```
--background: 0 0% 6%
--foreground: 0 0% 94%
--card: 0 0% 10%
--card-foreground: 0 0% 94%
--popover: 0 0% 14%
--popover-foreground: 0 0% 94%
--primary: 75 87% 57%        (lime #C8F135)
--primary-foreground: 0 0% 4%
--secondary: 0 0% 14%
--secondary-foreground: 0 0% 94%
--muted: 0 0% 14%
--muted-foreground: 0 0% 53%
--accent: 0 0% 14%
--accent-foreground: 0 0% 94%
--destructive: 0 91% 71%     (#F87171)
--destructive-foreground: 0 0% 4%
--border: 0 0% 18%
--input: 0 0% 18%
--ring: 75 87% 57%
```

### Body
Update body background and text in the `body {}` rule to use dark tokens.

## Section 2 — Targeted component fixes (dashboard.tsx)

Two places use `var(--circle-ink)` (`#0A0A0A`) as an accent card background. This is invisible against the dark global background:

### WOD hero card (around line 205)
```
background: 'var(--circle-ink)'   →   background: 'var(--c-surface-alt)'
                                       + border: '1px solid rgba(200,241,53,0.2)'
```
The lime ring/blob decorations and lime text stay unchanged — they'll read fine on the dark surface.

### Accent nav cards — Whiteboard link (around line 278)
```
background: accent ? 'var(--circle-ink)' : ...
→ background: accent ? 'var(--c-surface-alt)' : ...

border: accent ? '#222' : ...
→ border: accent ? 'rgba(200,241,53,0.25)' : ...

color: accent ? 'var(--circle-lime)' : ...   (unchanged)
```

## Section 3 — What stays unchanged

- All 14 page layouts, data-fetching, and server actions — zero structural changes
- Fonts: Bricolage Grotesque + Hanken Grotesk + Geist Mono — already match the design
- Whiteboard `.circle-dark` scope in `globals.css` — stays as slightly deeper black for TV display
- Mobile nav — adapts automatically via `var(--c-surface)` token
- All animations and motion tokens — already in place

## Files changed

1. `src/app/globals.css` — token replacement in `:root` + body rule
2. `src/app/dashboard/page.tsx` — 2 accent card background fixes

## Verification

After implementation:
- App background renders as near-black (`#0F0F0F`)
- Sidebar shows dark surfaces, lime active state, readable text
- Dashboard WOD hero card is visually distinct from background (lime-bordered dark surface)
- Whiteboard page remains extra-dark via `.circle-dark` scope
- shadcn Button renders with lime fill on dark background
- Status badges (paid/unpaid/overdue) are readable against dark surfaces
