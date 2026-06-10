# Conversion Attribution Report (#48) — Design

**Date:** 2026-06-10
**Roadmap:** v2 Tier 5 #48 `[G-gap]` — Conversion attribution report (lead source → first paying month). Final Tier 5 item.
**Status:** Approved by owner (sections approved in session)

## Goal

An owner report that shows, per acquisition source, how leads convert to members and how much paying revenue each channel produces.

## Scope decisions (user-approved)

- **Source funnel + revenue.** Per source: open leads, converted members, conversion %, paying members, MRR (AED). All-time. One owner page `/dashboard/attribution`.
- **Carry `source` on conversion.** `convertLead` currently drops the lead's `source`; add `profiles.source` and copy it on conversion (same pattern as `referred_by` in #49). Members created another way (owner invite, self-join) have `source = null` → bucketed "Other".
- No month-cohort timing, no date filter, no ad-spend/ROI — YAGNI.

## Data model (migration 050)

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS source text;
```

No other schema change — the report reads existing `leads`, `profiles`, `memberships`. `convertLead` extended to write `source: lead.source ?? null` on the new profile.

## Pure logic (`src/lib/attribution.ts`) — unit-tested

- `SOURCE_LABELS: Record<string, string>` — `instagram` → "Instagram", `tiktok` → "TikTok", `facebook` → "Facebook", `whatsapp` → "WhatsApp", `walk_in` → "Walk-in", `referral` → "Referral", `widget` → "Website widget", `other` → "Other".
- `sourceKey(raw: string | null): string` — normalize: empty/null/unknown → `'other'`, else the raw value (so any known + custom values group consistently).
- `buildAttribution(input)` →

```ts
type AttributionRow = { source: string; label: string; leads: number; members: number; conversionPct: number; paying: number; mrr: number }
type AttributionResult = { rows: AttributionRow[]; totals: Omit<AttributionRow, 'source' | 'label'> }

function buildAttribution(input: {
  leads: { source: string | null }[]            // open leads (still in the leads table)
  members: { athlete_id: string; source: string | null }[]  // athlete profiles
  paidByAthlete: Map<string, number>             // athlete_id -> monthly MRR, only for paid memberships
}): AttributionResult
```

Per source bucket (`sourceKey`):
- `leads` = count of open leads
- `members` = count of member profiles
- `conversionPct` = `members + leads === 0 ? 0 : Math.round(members / (members + leads) * 100)`
- `paying` = members present in `paidByAthlete`
- `mrr` = sum of those members' MRR
- `label` = `SOURCE_LABELS[source] ?? 'Other'`

Rows: only buckets with `leads > 0 || members > 0`; sorted by `members` desc, then `leads` desc. `totals` sums each numeric column; `totals.conversionPct` recomputed from total members/(members+leads).

## UI

**`/dashboard/attribution`** (owner-only):
- Queries (box-scoped): `leads (source)`, `profiles (id, source)` role athlete, `memberships (athlete_id, payment_status, monthly_price_aed)`.
- `paidByAthlete` = map of `athlete_id → monthly_price_aed` for memberships with `payment_status = 'paid'` (sum if multiple).
- `buildAttribution(...)` → table: **Source · Leads · Members · Conversion % · Paying · MRR (AED)**, one row per source + a bold **Total** row. Conversion % with a subtle tint; MRR via `toLocaleString`. Empty state when no rows.
- Sidebar `attribution` entry (owner) — reuse the existing `chart` icon.

## Testing

- Unit (`src/lib/attribution.test.ts`): `sourceKey` (null/empty/unknown → other; known passthrough); `buildAttribution` — per-source lead+member counts; conversion % (0-denominator → 0; all-converted → 100; mixed rounding); `paying`/`mrr` only from `paidByAthlete`; null source → "Other" bucket; totals sum + total conversion%; sort order (members desc then leads desc); excludes empty buckets.
- Report page verified by `type-check` + `build`; `convertLead` source-carry by `type-check`/`build` (the action calls `auth.admin.createUser`, which the shared mock doesn't simulate — same limitation noted in #49).

## Out of scope

- Month-cohort / time-to-first-payment timing
- Date-range filtering (all-time only)
- Multi-touch attribution, ad-spend / ROI inputs, charts beyond the table
