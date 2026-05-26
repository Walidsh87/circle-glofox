# PDPL Data Export — Design Spec

**Date:** 2026-05-26
**Status:** Approved

---

## Context

UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection (PDPL) grants every data subject the right to access all personal data a controller holds about them. A gym (the controller) must be able to produce that data on request, in a structured, commonly used, machine-readable format. The waiver feature already declares this consent; this spec implements the operational counterpart.

**Tier 1 #9** of the v2 roadmap.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Format | Single JSON file |
| Who triggers | Owner only, from `/dashboard/members/[memberId]` |
| Delivery | Direct browser download (route handler streams the file) |
| Audit trail | New `pdpl_exports` table |
| Scope | Any profile in the box, regardless of active/inactive status |
| Athlete self-service | Deferred (Tier 10 #78) |
| Right to erasure | Deferred (separate spec) |

---

## Architecture

A GET route handler at `/api/pdpl/export/[athleteId]` is the single entry point. On call:
1. Verifies the caller is an owner of the same box as the target athlete
2. Fetches every athlete-scoped row across the schema in parallel
3. Composes a single JSON document via the pure helper `buildPdplExport`
4. Writes an audit row to `pdpl_exports`
5. Returns the JSON with `Content-Disposition: attachment` so the browser saves it

The member detail page renders a plain `<a href>` pointing to that endpoint — no client component, no fetch, the browser handles the download natively.

### Why this approach
- Route handler in App Router is the idiomatic Next.js way to serve a file download
- The pure builder is unit-testable without spinning up the route
- A single audit table records the *fact* of access; the file itself is not stored server-side (privacy by design — once delivered, the controller doesn't keep a copy)

---

## Database

### `migrations/011_pdpl_exports.sql`

```sql
CREATE TABLE IF NOT EXISTS pdpl_exports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exported_by   UUID NOT NULL REFERENCES profiles(id),
  exported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address    TEXT
);

ALTER TABLE pdpl_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdpl_exports_owner_read ON pdpl_exports;
CREATE POLICY pdpl_exports_owner_read ON pdpl_exports
  FOR SELECT USING (auth_role() = 'owner' AND auth_box_id() = box_id);
```

No INSERT/UPDATE policy needed — the route handler uses the service-role client.

---

## Data scope

The export includes everything the system holds about the athlete. Tables/data covered:

| Source | Field selection |
|--------|-----------------|
| `profiles` | id, full_name, email, phone, role, created_at, box_id |
| `memberships` | full row (plan, prices, dates, payment_status, last_paid_date, stripe_price_id) |
| `bookings` | class_instance_id, checked_in, checked_in_at, overridden_at, overridden_reason |
| `athlete_lifts` | full row (lift name, one_rm_grams, recorded_at) |
| `workout_scores` | workout_id, score, scoring_type, recorded_at |
| `waiver_signatures` | full_name, signed_at, ip_address, user_agent |
| `billing_reminders` | stage, due_date, sent_at, email |

Excluded: data **about** the athlete that lives elsewhere only as a foreign key (e.g., box-level audit logs that reference the athlete but contain no personal data beyond the ID).

---

## Pure helper (`src/lib/pdpl-export.ts`)

```ts
export type PdplExportInput = {
  profile: ProfileRow
  memberships: MembershipRow[]
  bookings: BookingRow[]
  lifts: LiftRow[]
  scores: ScoreRow[]
  waiverSignature: WaiverSignatureRow | null
  billingReminders: BillingReminderRow[]
}

export type PdplExportOutput = {
  meta: {
    export_date: string         // ISO timestamp
    export_purpose: string      // "UAE PDPL — data subject access request"
    controller_law_reference: string  // "UAE Federal Decree-Law No. 45 of 2021"
    data_subject_id: string     // athlete UUID
  }
  athlete: {
    profile: ProfileRow
    memberships: MembershipRow[]
    bookings: BookingRow[]
    lifts: LiftRow[]
    scores: ScoreRow[]
    waiver_signature: WaiverSignatureRow | null
    billing_reminders: BillingReminderRow[]
  }
}

export function buildPdplExport(input: PdplExportInput): PdplExportOutput
```

Pure function. No DB calls, no env access. Each row type is a structural interface mirroring the Supabase select.

---

## Tests (TDD)

`src/__tests__/pdpl-export.test.ts` — 3 tests:

1. **Empty arrays** — `buildPdplExport({ profile: {...}, memberships: [], bookings: [], lifts: [], scores: [], waiverSignature: null, billingReminders: [] })` returns an object with all sections present as empty arrays/null.
2. **Full input** — every section populated → output preserves order and structure, meta header correct.
3. **Metadata** — `output.meta.export_date` is a valid ISO timestamp, `controller_law_reference` is the exact PDPL string.

---

## Route handler (`src/app/api/pdpl/export/[athleteId]/route.ts`)

```
1. const { athleteId } = params
2. const supabase = createClient() (RLS-aware, from cookies)
3. user = supabase.auth.getUser(); if no user → 401
4. profile = SELECT box_id, role FROM profiles WHERE id = user.id
5. If profile.role !== 'owner' → 403
6. athlete = SELECT box_id FROM profiles WHERE id = athleteId
7. If !athlete OR athlete.box_id !== profile.box_id → 404
8. Use SERVICE-ROLE client for the data fetch (athletes don't have RLS to read others' data; service-role bypasses)
9. Parallel fetch: profile, memberships, bookings, lifts, scores, waiverSignature, billingReminders
10. Build the JSON via buildPdplExport(...)
11. INSERT INTO pdpl_exports (box_id, athlete_id, exported_by, ip_address)
12. Return new Response(JSON.stringify(output, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="pdpl-export-${athleteId}-${today}.json"`,
      },
    })
```

The route uses `dynamic = 'force-dynamic'` and the same fetch-cache override as the billing-reminders route to avoid stale data.

---

## UI changes — `src/app/dashboard/members/[memberId]/page.tsx`

Existing page is the owner's view of a single member. Two additions:

### Export button
Plain anchor (no client component needed):
```tsx
<a
  href={`/api/pdpl/export/${memberId}`}
  download
  style={{ /* button styling */ }}
>
  Export PDPL data (JSON)
</a>
```
With a small footnote: "UAE Federal Decree-Law No. 45 of 2021"

### Export history card
Below the button, a card listing past `pdpl_exports` rows for this athlete:
- Exported by (owner name)
- Date
- IP

Empty state: "No exports yet."

---

## Verification

- Owner visits `/dashboard/members/[memberId]` → sees "Export PDPL data" button
- Click → browser downloads `pdpl-export-{id}-{date}.json`
- File opens as valid JSON with `meta` and `athlete` sections, all data present
- `pdpl_exports` table gets a new row (athlete_id, exported_by = current owner, exported_at, ip_address)
- Refresh the member page → "Export history" card now shows that row
- Athlete role visits `/api/pdpl/export/{anyId}` directly → 403
- Owner visits with an athleteId from a different box → 404
- `npm run test` — 3 new tests pass
- `npm run type-check` — 0 errors

---

## Out of scope

- Athlete self-service (Tier 10 #78)
- Right to erasure / data deletion on request (separate spec)
- PDF human-readable summary (could add later as a sibling endpoint)
- Localization to Arabic (Tier 9 #71)
- Long-term storage of exported files (privacy by design — controller doesn't retain copies)
