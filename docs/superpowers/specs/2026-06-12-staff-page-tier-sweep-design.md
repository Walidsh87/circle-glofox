# Staff page-tier sweep (#57 leftovers) — Design

**Date:** 2026-06-12
**Scope:** finish #57 granular roles at the page-render layer. Five `['owner','coach']` literals survived the #57 guard sweep because they live inside pages with bespoke logic (self-view, display affordances) rather than page-guard calls. Result today: admin/receptionist hit a redirect from every member-profile link and get an athlete-style dashboard home; admins lack class/WOD authoring affordances their tier already authorizes server-side.

**Approach (user-approved option 2):** widen each literal to its #57-correct tier constant. No migration, no RLS change, no action change — every affordance exposed is already authorized at that tier by the existing action guards (verified: `updateMember` is `requireStaffAction` with owner-only role-change rails; classes/WOD authoring actions are programming-tier; `import-batch`'s literal is the documented grandfathered misfit and stays).

## Changes (5 lines, 4 files)

| File / line | From | To |
|---|---|---|
| `src/app/dashboard/members/[memberId]/page.tsx:99` (view gate) | `!['owner', 'coach'].includes(viewer.role) && user.id !== params.memberId` | `!(ALL_STAFF_ROLES as readonly string[]).includes(viewer.role) && user.id !== params.memberId` |
| `src/app/dashboard/members/[memberId]/page.tsx:341` (EditMemberForm render) | `['owner', 'coach'].includes(viewer.role)` | `(ALL_STAFF_ROLES as readonly string[]).includes(viewer.role)` |
| `src/app/dashboard/page.tsx:18` | `const isStaff = ['owner', 'coach'].includes(profile.role)` | `const isStaff = (ALL_STAFF_ROLES as readonly string[]).includes(profile.role)` |
| `src/app/dashboard/classes/page.tsx:23` | `const isStaff = ['owner', 'coach'].includes(profile.role)` | `const isStaff = (PROGRAMMING_ROLES as readonly string[]).includes(profile.role)` |
| `src/app/dashboard/wod/page.tsx:94` | `const isStaff = ['owner', 'coach'].includes(profile.role)` | `const isStaff = (PROGRAMMING_ROLES as readonly string[]).includes(profile.role)` |

Imports added where missing: `ALL_STAFF_ROLES` (dashboard/page.tsx) and `PROGRAMMING_ROLES` (classes, wod) from `@/lib/auth/roles`. The member page already imports `ALL_STAFF_ROLES`.

## Deliberately untouched

- `classes/page.tsx:36` — `.in('role', ['owner','coach'])` coach-picker query: "who can be assigned as coach" is a domain choice, not an access gate.
- `import-batch.ts:27` — action-level literal, grandfathered in the architecture pass.
- Invoices RLS (`('owner','coach')` reads): admin/receptionist now reach member profiles and see an **empty invoices list** — known 058 stance, cosmetic, documented.
- `wod` week-lock for receptionists (they navigate like athletes, current week only): per-tier intent — authoring tier gets free navigation.

## Behavior after

- Admin/receptionist: profile links work everywhere (People, leads, tasks, PAR-Q queue); EditMemberForm available (role-change select stays owner-only inside the action/form); staff dashboard home (member count, today's classes, leads/tasks counts; revenue card still owner-only).
- Admin additionally: classes template create/edit/delete and WOD editor + free week navigation (already action-authorized).
- Receptionist on classes/wod: read-only view, week-locked — unchanged from today.

## Testing / verification

Server-component render gates — no unit tests per codebase convention; existing 922-test suite must stay green. Full gate (type-check, lint, vitest, build), then push. No migration.
