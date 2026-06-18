# Access-control alignment (G ⊆ P) — reference for the pre-ship-review check

Before shipping any route/page/action that reads or writes a table, verify **G ⊆ P**
(guard roles ⊆ RLS-policy roles). A guard **wider** than the policy clears the guard but
then gets **zero rows from RLS** — a silent empty result that looks like missing data,
not denied access. (This is the gap Phase C caught on the accounting export: a
`requireManagerPage` page over `invoices`, whose policy admits only owner/coach, so an
`admin` saw an empty page/CSV.)

## Role model
`owner, admin, coach, receptionist, athlete` (athlete = member). Defined in
`src/lib/auth/roles.ts`. **Admins have no financial access by design** — payments,
payroll, KPI, attribution, settings, staff-management, and invoices/credit-notes at the
RLS layer.

## Read G from — the guards
`src/lib/auth/page-guards.ts` (and the mirrored `action-guards.ts`). The role set each
guard admits:
- `requirePage` / `requireAction` → any signed-in user (any role)
- `requireOwnerPage` / `requireOwnerAction` → **{owner}**
- `requireManagerPage` / `requireManagerAction` → **{owner, admin}** (`MANAGER_ROLES`)
- `requireProgrammingPage` / `requireProgrammingAction` → **{owner, admin, coach}** (`PROGRAMMING_ROLES`)
- `requireStaffPage` / `requireStaffAction` → **{owner, admin, coach, receptionist}** (`ALL_STAFF_ROLES`)

Tier constants live in `src/lib/auth/roles.ts`.

## Read P from — the RLS policies
`migrations/NNN_*.sql` — the role set a table's policy admits. Two shapes:
1. **Tier-helper policies** — `auth_is_staff()` / `auth_is_manager()` / `auth_is_programming()`
   (SQL functions defined in **mig 058**, kept in sync with the TS tiers above). These map
   1:1 to the guards, so **G == P by construction** — low risk.
2. **Literal role-list policies** — `auth_role() IN ('owner','coach')` etc. **This is where
   mismatch lives.** Extract the literal list from the policy's `USING` / `WITH CHECK`.
   - **invoices**: `staff_read_invoices` (**mig 019**, documented in **mig 058**) → **{owner, coach}**;
     `admin` deliberately excluded. A financial page over `invoices` must therefore be
     `requireOwnerPage` ({owner} ⊆ {owner,coach} ✓), **not** `requireManagerPage`
     (admin ∈ G but ∉ P → admin gets silent-empty).
   - **credit_notes** carries the same grandfathered shape (mig 019/058).

## The rule
- **G ⊆ P required.** Any role in **G ∖ P** → clears the guard, then silent-empty from RLS
  → **DON'T-SHIP**. Fix by narrowing the guard (preferred — migration-free) or widening the
  policy (a migration → STOP-and-ask).
- **P ⊋ G is allowed** but **document it** as a deliberate, narrower choice (the guard
  excludes users the data layer would authorize).
- **Emit a G-vs-P table** per touched table in the review.

## Worked example (the Phase C catch)
| Table | Guard (G) | RLS policy (P) | G ⊆ P? | Verdict |
|---|---|---|---|---|
| `invoices` | `requireManagerPage` → {owner, admin} | `staff_read_invoices` → {owner, coach} | ✗ (admin ∈ G∖P) | DON'T-SHIP → narrowed to `requireOwnerPage` → {owner} ⊆ P ✓ |
