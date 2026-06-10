# Automated Sequences (#44) — Design

**Status:** Approved (design) — 2026-06-09
**Roadmap:** v2 Tier 5 #44 — "Automated sequences (welcome, trial-to-member, win-back, birthday)"

## Goal

Let an owner build **multi-step email drips** — an enrollment trigger plus an ordered list of timed steps — so a member who joins (or goes quiet, or starts a trial) receives a series of emails over days, with the drip stopping the moment it no longer applies.

## Relationship to #37 (on record)

#37 automations are **stateless**: each day the cron matches members per trigger and fires a single email once (deduped via `automation_runs`). That can't track "this member is on step 2 of 4." #44 adds the **stateful** layer — enrollment + per-step progress — as a **separate sequences system**. #37 is untouched and keeps working for single-step automations.

**Reuses from #37/#41:** the trigger matcher (`matchAutomation`), `AutoMember` + the per-box member loader (extracted to a shared module), `triggerLabel`, the #41 `BlockEditor` / `renderEmail` / `sendBroadcastEmails` / unsubscribe + `marketing_opt_out`.

**Overlap:** running a #37 single "welcome" automation *and* a #44 "welcome" sequence double-emails a member. That's an owner setup choice — surfaced in UI copy, not blocked.

## Scope boundary (on record)

- **Email channel only** — SMS/WhatsApp are #42/#39.
- **Reuses #37's four trigger types** (`joined`/`trial_ending`/`no_checkin`/`birthday`) as enrollment events — no new trigger types.
- **Linear sequences only** — no A/B testing, no branching/conditional steps.
- **No per-step open/click analytics** — sent counts only (deferred, same as #37).

## Architecture

A pure engine (`src/lib/sequences.ts`) decides what to send and when; a daily cron (`/api/cron/sequences`) runs two passes — **enroll** then **advance** — reusing the #37 matcher and a shared member loader. Steps live as a jsonb array on the sequence; enrollment + sends are the stateful tables.

### Data model (migration 044)

**`sequences`** — the definition:
```
id           uuid PK default gen_random_uuid()
box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE
name         text NOT NULL
trigger_type text NOT NULL            -- 'joined' | 'trial_ending' | 'no_checkin' | 'birthday'
trigger_days integer                  -- N days; NULL for 'birthday'
steps        jsonb NOT NULL           -- ordered [{ offset_days:int, subject:string, body_blocks:Block[] }]
enabled      boolean NOT NULL DEFAULT true
created_by   uuid REFERENCES profiles(id)
created_at   timestamptz NOT NULL DEFAULT now()
```
Owner-only RLS (`box_id = auth_box_id() AND auth_role() = 'owner'`).

**`sequence_enrollments`** — who's in, and where:
```
id            uuid PK default gen_random_uuid()
box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE
sequence_id   uuid NOT NULL REFERENCES sequences(id) ON DELETE CASCADE
athlete_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
enrolled_on   date NOT NULL
enroll_key    text NOT NULL
status        text NOT NULL DEFAULT 'active'   -- 'active' | 'completed' | 'exited'
created_at    timestamptz NOT NULL DEFAULT now()
UNIQUE (sequence_id, athlete_id, enroll_key)
```
The unique key = #37's `fire_key` idea: a member enrolls once per occurrence, and can re-enroll on a *new* occurrence (e.g. a fresh win-back lapse → new `enroll_key`). Owner-only RLS read; cron writes via service role.

**`sequence_sends`** — per-step ledger:
```
id            uuid PK default gen_random_uuid()
box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE
enrollment_id uuid NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE
step_index    integer NOT NULL
sent_at       timestamptz NOT NULL DEFAULT now()
resend_id     text
UNIQUE (enrollment_id, step_index)
```
Owner-only RLS read; cron writes.

### Pure engine — `src/lib/sequences.ts`

```ts
import type { Block } from './email-blocks'
import type { AutoMember } from './automations'  // trigger_type reused from there too

export type SequenceStep = { offset_days: number; subject: string; body_blocks: Block[] }

// next step to send for an enrollment, or null if nothing due / all done.
export function nextDueStep(steps: SequenceStep[], enrolledOn: string, today: string, sentCount: number): number | null
// the index to send is `sentCount` (steps go in order); due when offset_days <= daysBetween(enrolledOn, today).

export function enrollmentStillValid(
  triggerType: 'joined' | 'trial_ending' | 'no_checkin' | 'birthday',
  member: Pick<AutoMember, 'trialEndDate' | 'lastCheckIn'>,
  enrolledOn: string,
): boolean
```

`nextDueStep` logic: if `sentCount >= steps.length` → `null` (completed); else if `steps[sentCount].offset_days <= daysBetween(enrolledOn, today)` → `sentCount`; else `null`.

`enrollmentStillValid` per trigger:
- `joined` / `birthday` → `true` (always run to completion)
- `trial_ending` → `member.trialEndDate !== null` (exits when trial converts/ends)
- `no_checkin` → `member.lastCheckIn == null || member.lastCheckIn <= enrolledOn` (exits the moment they check in after enrolling)

`daysBetween` is the same date-diff used in #37 (`from`/`to` sliced to `YYYY-MM-DD`).

### Shared loader — `src/lib/auto-members.ts`

Extract the existing `loadAutoMembers(service, boxId, today)` (currently a local function in `/api/cron/automations/route.ts`) into this module, exporting `{ members: AutoMember[]; tokenByAthlete: Map<string,string> }`. Update the #37 cron to import it (import-only change; behavior identical).

### Cron — `src/app/api/cron/sequences/route.ts`

`export const dynamic = 'force-dynamic'`; `GET` guarded by `Authorization: Bearer ${env.CRON_SECRET}`; service-role client. Per box:

1. Load enabled `sequences`; `loadAutoMembers`; gym name.
2. **Enroll pass** — for each sequence: `matchAutomation({ id, trigger_type, trigger_days }, members, today)` → matches with `fire_key`. Skip any already enrolled (`sequence_id, athlete_id, enroll_key`). Insert the rest as `active` enrollments (`enrolled_on = today`, `enroll_key = match.fire_key`).
3. **Advance pass** — load `active` enrollments for the box's sequences + their `sequence_sends`. For each enrollment:
   - member opted-out / no email, or `!enrollmentStillValid(trigger_type, member, enrolled_on)` → update status `exited`; continue.
   - `idx = nextDueStep(steps, enrolled_on, today, sentCount)`; if `null` → continue.
   - render `steps[idx]` via `renderEmail({ blocks: step.body_blocks, plainBody: step.subject, ctx })` → `sendBroadcastEmails([msg])`; on success insert a `sequence_sends` row (`step_index = idx`, `resend_id`); if `idx === steps.length - 1` → status `completed`.

One step per enrollment per run (no bursts). Returns `{ enrolled, sent, exited, errors }`.

`vercel.json`: add `{ "path": "/api/cron/sequences", "schedule": "15 6 * * *" }`.

## UI

New owner-only `Sequences` sidebar item → `/dashboard/sequences` (icon `'layers'`).

- **List** (`page.tsx`): each sequence — name, `triggerLabel(trigger_type, trigger_days)`, step count, enable/disable toggle, active-enrollment count + total sent (from the ledgers), edit + delete. Empty state explains the feature + notes the #37 overlap.
- **Editor** (`/new`, `/[id]`): name, trigger select + N-days input (hidden for birthday), and a **steps editor** — ordered list; each step has an `offset days` number input, a subject input, the **#41 `BlockEditor`** + live preview; add/remove/reorder (↑/↓).
- **Server actions** (`_actions/`): `saveSequence` (create/update), `deleteSequence`, `toggleSequence` — owner-gated, Zod-validated.
- `_lib/sequence-validation.ts`: `validateSequence(name, triggerType, triggerDays, steps)` — name 1–120; trigger valid; `trigger_days` rule identical to #37 (positive int unless birthday); ≥1 step and ≤ a small max (e.g. 20); each step `offset_days` integer ≥ 0; offsets non-decreasing; each step subject 1–150 and `validateBlocks` passes.

## Error handling

- Missing/incorrect `CRON_SECRET` → 401.
- Per-box / per-send failures collected into `errors[]`; one failure never aborts the run.
- Opted-out / no-email enrollments → marked `exited`, never counted as sends.
- Server actions return `{ error: string | null }`; invalid input → typed error.

## Testing (TDD)

**Pure** — `src/lib/sequences.test.ts` (~12):
- `nextDueStep`: nothing due (offset in future), due (offset reached → returns `sentCount`), order (returns the next unsent index), completion (`sentCount >= length` → null), backlog (two overdue → still returns just the next one).
- `enrollmentStillValid`: `joined`/`birthday` always true; `trial_ending` true with active trial / false when `trialEndDate` null; `no_checkin` true while quiet / false once `lastCheckIn > enrolledOn`.

**Validation** — `_lib/sequence-validation.test.ts`: name, trigger, days rule, empty steps, bad offset, decreasing offsets, bad blocks, bad subject.

**Integration** — dual-client + mocks (mirroring #37 cron + actions):
- `saveSequence`/`deleteSequence`/`toggleSequence`: owner-gating, box-scoping, step shape persisted.
- cron `/api/cron/sequences`: 401 on bad secret; enroll inserts an enrollment with `enroll_key`; advance sends the due step + writes `sequence_sends` with `resend_id`; a returned member (`lastCheckIn > enrolled_on`, `no_checkin`) is marked `exited` and not emailed; an already-sent step is not re-sent.

## Migration

`migrations/044_sequences.sql` (idempotent; run manually in Supabase). Update `migrations/ROLLBACKS.md` (range → 044; reverse entry drops `sequence_sends`, `sequence_enrollments`, `sequences`).

## Reused building blocks

- `matchAutomation`, `AutoMember`, `TriggerType` — `@/lib/automations`
- `loadAutoMembers` — extracted to `@/lib/auto-members` (was inline in the #37 cron)
- `triggerLabel`, `TRIGGER_OPTIONS` — `@/app/dashboard/automations/_lib/automation-copy`
- `BlockEditor` — `@/app/dashboard/broadcasts/_components/block-editor`
- `renderEmail`, `firstNameOf` — `@/lib/broadcast-render`
- `validateBlocks`, `flattenBlocks`, `Block` — `@/lib/email-blocks`
- `sendBroadcastEmails`, `BroadcastMessage` — `@/lib/email`
- cron auth + service-role pattern — `/api/cron/automations`

## Genuine tradeoffs

- **Up to ~24h step latency** (daily cron) and **one step per enrollment per run** — correct for gym drips, avoids burst-sending a backlog.
- **Extracting `loadAutoMembers`** touches the #37 cron (import-only) — a justified DRY move so both crons share one loader.
- **Stateful enrollment can't be hand-edited** in v1 (no "skip this member to step 3") — the engine owns progression; fix the underlying reality instead.
