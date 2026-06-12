# Audit log — capture + owner UI (#68) — Design

**Date:** 2026-06-12
**Roadmap:** Tier 8 #68 `[G-gap]` Audit log UI — refunds, role changes, deletes *(portal_access_log shipped earlier covers portal-token access only)*
**Scope (user-approved):** v1 captures four events — invoice refunds, staff role changes, member removals, staff MFA resets. Viewer: **owner-only** (money/058 tier stance). Other sensitive actions (~8) are a 3-line helper call each, later.

## Why capture is half the feature

None of the four actions leaves a trail today (`changeStaffRole` just updates the row; `removeMember` deletes it). The log must be written **server-side from inside the actions** via the service role — nothing client-originated, append-only, so it can't be forged or erased from the app.

## Schema — migration `062_audit_log.sql` (idempotent, + ROLLBACKS.md entry)

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,          -- snapshot; survives actor deletion
  action     TEXT NOT NULL,          -- 'invoice.refund' | 'staff.role_change' | 'member.remove' | 'staff.mfa_reset'
  target     TEXT NOT NULL,          -- human snapshot: 'INV-0042' / 'Sara Hassan'
  details    JSONB,                  -- per-action payload, see table below
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_box_created ON audit_log (box_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_owner_select ON audit_log;
CREATE POLICY audit_log_owner_select ON audit_log
  FOR SELECT USING (auth_role() = 'owner' AND box_id = auth_box_id());

-- NO insert/update/delete policies: service-role-only writes, append-only
-- (push_subscriptions precedent).
```

Retention: none in v1 — volumes are tiny and it's an evidence trail. PDPL note: rows hold actor/target name snapshots; access is in-box owner-only.

## Capture

### Helper — `src/lib/audit.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction = 'invoice.refund' | 'staff.role_change' | 'member.remove' | 'staff.mfa_reset'

export type AuditEvent = {
  boxId: string
  actorId: string
  actorName: string | null   // null → stored as 'Staff'
  action: AuditAction
  target: string
  details?: Record<string, unknown>
}

/** Append-only audit write. NEVER throws — an audit hiccup must not break the action. */
export async function logAudit(service: SupabaseClient, ev: AuditEvent): Promise<void>
```

Implementation: insert `{box_id, actor_id, actor_name: ev.actorName ?? 'Staff', action, target, details: ev.details ?? {}}`; on error (or throw) `console.error('audit log failed:', …)` and return.

### Actor-name plumbing

`requireRoleAction` in `src/lib/auth/action-guards.ts` widens its select from `'box_id, role'` to `'box_id, role, full_name'`; `StaffActionContext['profile']` gains `full_name: string | null`. (Verified: no test asserts the select string; mocks returning profiles without `full_name` yield `undefined` → `?? null ?? 'Staff'` fallback chain handles it.) `requireUserAction` untouched.

### Instrumented actions (log AFTER the mutation succeeds; all four already hold a service client)

| Action | Lookup widening | `action` | `target` | `details` |
|---|---|---|---|---|
| `refundInvoice` | none (invoice row in scope) | `invoice.refund` | `invoice.invoice_number` | `{ amount_aed, reason, invoice_id, athlete_id }` |
| `changeStaffRole` | target select `'role'` → `'role, full_name'` | `staff.role_change` | target full_name ?? 'Staff member' | `{ from: target.role, to: role }` |
| `removeMember` | member select `'box_id'` → `'box_id, full_name, role'`; caller select gains `full_name` (bespoke guard) | `member.remove` | member full_name ?? 'Member' | `{ role: memberProfile.role }` |
| `resetStaffMfa` | target select `'role'` → `'role, full_name'` | `staff.mfa_reset` | target full_name ?? 'Staff member' | `{ factors: factors.length }` |

`removeMember` logs after the auth-user deletion completes (the irreversible point). `actorName` for it comes from its own caller-profile select; the other three read `profile.full_name` off the widened guard context.

## UI — `/dashboard/audit`

- `requireOwnerPage`; sidebar: `if (isOwner) runTheGym.push({ key: 'audit', label: 'Audit log', href: '/dashboard/audit', … })` after Settings (icon: reuse an existing key from the sidebar icon map, or add one small inline SVG entry to it — implementer's pick, no new icon system).
- Fetch: RLS client, last **200** rows `order('created_at', { ascending: false })`, optional `.eq('action', filter)` from `?action=` searchParam.
- Filter pills: All · Refunds · Role changes · Removals · MFA resets (link-based, house pill pattern).
- Table (Ivory & Lime `ui/` primitives): When (`YYYY-MM-DD HH:mm`, gym-local via the fixed-offset convention) · Who (`actor_name`) · Action (Badge, tone: refund=warn, remove=danger, others=neutral) · Target · Details (per-action compact line: `AED 150 — duplicate charge` / `coach → admin` / `was coach` / `2 factors cleared`).
- CSV via the house `toCsv` + `DownloadCsvButton` (same 200-row window).
- Empty state: "No audited events yet — refunds, role changes, removals and MFA resets will appear here."

A pure formatter `describeAuditDetails(action, details): string` in `src/lib/audit.ts` keeps the per-action rendering testable.

## Testing (~10 new; existing files untouched)

New `src/__tests__/audit-log.integration.test.ts` + pure tests:
- `logAudit` (2): inserts the full payload (incl. `actor_name` fallback `'Staff'`); insert error → resolves without throwing, action unaffected.
- `describeAuditDetails` (4): one per action key; unknown action → `''`.
- Per-action capture (4): run each instrumented action happy-path with mocks, assert `audit_log` insert called with the right `action` + `target` (mock result queues; `audit_log` table mock returns `{data:null,error:null}`).

## Verification gate

House standard (type-check / lint / vitest / build, run separately, READ output) → apply mig 062 to prod via docker psql with probes (`audit_log` exists, `pg_policies` count = 1) → trigger one real event (role change on a test row or MFA reset no-op) optional → roadmap #68 → ✅ → push.

## Deferred

Instrumenting the remaining sensitive actions (membership save/cancel/freeze, mark-paid, PAR-Q edits, check-in overrides, lead deletes, member adds); retention/pruning; merging `portal_access_log` / `pdpl_exports` into this view; pagination beyond 200; manager-tier read access.
