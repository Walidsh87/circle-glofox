# In-app Help Center (#66 + broader help)

**Date:** 2026-06-22
**Status:** Design approved (Walid), ready for implementation plan
**Origin:** #66 (Zapier) reframed — the API/webhook/Zapier *plumbing* already ships (#65), so the real need is owner-facing **help/onboarding**. Expanded (owner's call) to a full Help Center covering 4 areas, with Integrations/Zapier as the flagship topic.

## Summary

A staff-facing `/dashboard/help` Help Center: a two-pane page (left = topic nav grouped by area — the "help sidebar"; right = the selected guide), driven by `?topic=<slug>`. Content is **typed data** (no DB, no migration, no markdown dependency) rendered by a generic block renderer (XSS-safe — typed blocks → JSX, never `dangerouslySetInnerHTML`). ~17 guides across 4 areas, authored to match what's actually built. Designed so a new guide = one registry entry + one data file.

## Scope decisions (confirmed)
- **Audience:** staff/owner (`requireStaffPage`) — "how to run the gym on this platform." Member-facing help is out (future).
- **All 4 areas / ~17 guides** (listed below).
- **Content as typed blocks** (heading/paragraph/steps/bullets/code/link/note) — safe, no deps, easy to extend.
- **No DB / migration / new server action** — read-only static content.

## Architecture
- `src/lib/help/types.ts` — `HelpArea` (4 areas), `HelpBlock` union, `HelpGuide` (`{ slug, area, title, summary, blocks }`).
- `src/lib/help/guides/<slug>.ts` — one file per guide exporting a `HelpGuide`.
- `src/lib/help/registry.ts` — imports all guides → `HELP_GUIDES`, `guidesByArea()`, `findGuide(slug)`, `AREA_ORDER`/`AREA_LABELS`.
- `src/app/dashboard/help/page.tsx` — two-pane: left nav (areas → guide links `?topic=`), right = selected guide (default = the overview/first). `searchParams: Promise<{ topic?: string }>` (Next 16).
- `src/app/dashboard/help/_components/guide-body.tsx` — renders `HelpBlock[]` (internal links → `next/link`; external `https` → `<a target=_blank rel=noopener noreferrer>`).
- Sidebar: a `help` nav entry (all staff) + a help icon.

## The ~17 guides
- **Setup & operations:** getting-started · settings-and-keys (Stripe/Resend/Twilio/Anthropic/VAPID/crons) · staff-roles · security-compliance (MFA/PDPL/waivers/PAR-Q)
- **Memberships & money:** plans-and-packages · payments-and-stripe · invoices-refunds-dunning · front-desk
- **Classes & programming:** classes-and-scheduling · booking-waitlist-checkin · daily-wod-and-planner · program-store · the-wedge-and-movement-videos
- **Growth & integrations:** leads-and-lifecycle · campaigns-and-automations · embed-widgets · integrations (Zapier + example Zaps + public API/webhooks + calendar sync) ← flagship

## Content authoring (build)
Each guide is authored grounded in that feature's actual code/roadmap (so steps, page paths, and event/endpoint names are accurate). The flagship Integrations guide includes concrete example Zaps (lead.created→Sheets, member.created→Mailchimp, payment.succeeded→QuickBooks, FB Lead Ad→`POST /api/v1/leads`) + the API-key + webhook setup steps + that "Webhooks by Zapier" needs a paid Zapier plan. An accuracy-review pass cross-checks every guide against the codebase.

## Testing
- **Pure:** `registry` (every guide has a unique slug + a valid area; `findGuide`/`guidesByArea` correctness); a small `HelpBlock` render-mapping sanity test (each block type maps to expected text/markup) if practical.
- **Page:** type-check + full suite green + manual (read-only page; the only logic — registry lookups — is unit-tested).
- **Accuracy:** the review pass (each guide vs the feature).
- No migration, no RLS surface (static content; `requireStaffPage` gate).

## Out of scope (future)
- Member-facing help; in-app search; screenshots/images/video; i18n (English v1, like other staff surfaces); contextual "?" deep-links from each feature page; a first-class *published* Zapier app (separate Zapier-platform artifact).
