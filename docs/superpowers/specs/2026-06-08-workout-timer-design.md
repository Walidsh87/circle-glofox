# In-App Workout Timer — Design

**Date:** 2026-06-08
**Feature:** A gym-floor workout timer at `/dashboard/timer` supporting For Time, AMRAP, EMOM, and Intervals (Tabata) with a 10-second lead-in and audio beeps.
**Roadmap:** v2 Tier 3 #24 (in-app workout timer). Fully client-side — no backend, no migration.

---

## Problem

Boxes run workouts on a clock (count up for time, down for an AMRAP, every-minute EMOM, work/rest intervals). The app has no timer, so athletes/coaches use a separate phone app. This adds a built-in one.

## Scope decisions (locked during brainstorming)

1. **Full CrossFit mode set:** For Time (count up), AMRAP (count down), EMOM (every interval × rounds), Intervals/Tabata (work/rest × rounds), plus a fixed **10s lead-in** (3-2-1-GO) before work.
2. **Audio beeps** (Web Audio oscillator — no asset files), initialised on the Start tap.
3. **Dedicated `/dashboard/timer` page**, available to **any logged-in user** (athletes + staff).
4. Architecture **A:** a pure `tick` engine + a thin client component.

## Approach (chosen: A)

All per-mode phase/round/remaining math is a **pure `tick(config, elapsedSeconds)` function** (no DOM, no audio) — fully unit-tested. A client `Timer` component drives it with a 100ms interval over accumulated (pause-safe) run-time, renders big phase-colored numbers, and emits beeps by diffing the previous vs current `tick` state. No backend, no migration, no new dependency.

Rejected: **B** a component per mode (duplicated timing logic, untestable); **C** a third-party timer package (needless dep, less control over beeps/display).

---

## 1. Pure engine — `src/app/dashboard/timer/_lib/engine.ts`

```ts
export type TimerConfig =
  | { mode: 'for_time'; capSeconds: number | null }                 // count up; optional cap → done
  | { mode: 'amrap'; durationSeconds: number }                      // count down → done at 0
  | { mode: 'emom'; intervalSeconds: number; rounds: number }       // one round each interval
  | { mode: 'intervals'; workSeconds: number; restSeconds: number; rounds: number } // Tabata-style

export type TimerPhase = 'leadin' | 'work' | 'rest' | 'done'
export type TimerState = {
  phase: TimerPhase
  round: number              // 1-based current round; 0 during lead-in
  totalRounds: number        // total rounds (1 for for_time/amrap)
  secondsLeftInPhase: number // whole seconds remaining in the current phase
  secondsElapsed: number     // whole seconds of work elapsed (for count-up display)
  secondsLeftTotal: number | null // whole seconds remaining for fixed-duration modes (amrap), else null
  label: string              // 'GET READY' | 'GO' | 'EMOM 3/10' | 'WORK 2/8' | 'REST' | 'DONE'
}

export const LEAD_IN_SECONDS = 10

export function tick(config: TimerConfig, elapsed: number): TimerState
```

Behaviour (`elapsed` = seconds since Start, may be fractional):
- **Lead-in:** `elapsed < LEAD_IN_SECONDS` → `phase 'leadin'`, `secondsLeftInPhase = ceil(LEAD_IN_SECONDS - elapsed)`, `round 0`, label `'GET READY'`.
- Let `t = elapsed - LEAD_IN_SECONDS` (work time, `>= 0`).
- **for_time:** `secondsElapsed = floor(t)`; if `capSeconds !== null && t >= capSeconds` → `done`; else `phase 'work'`, `totalRounds 1`, `round 1`, label `'GO'`.
- **amrap:** `rem = durationSeconds - t`; if `rem <= 0` → `done`; else `phase 'work'`, `secondsLeftInPhase = secondsLeftTotal = ceil(rem)`, `totalRounds 1`, `round 1`.
- **emom:** `total = intervalSeconds * rounds`; if `t >= total` → `done`; else `round = floor(t / intervalSeconds) + 1`, `phase 'work'`, `secondsLeftInPhase = ceil(intervalSeconds - (t % intervalSeconds))`, `totalRounds = rounds`, label `'EMOM {round}/{rounds}'`.
- **intervals:** `cycle = workSeconds + restSeconds`; `total = cycle * rounds`; if `t >= total` → `done`; else `round = floor(t / cycle) + 1`, `pos = t % cycle`; if `pos < workSeconds` → `phase 'work'`, `secondsLeftInPhase = ceil(workSeconds - pos)`, label `'WORK {round}/{rounds}'`; else `phase 'rest'`, `secondsLeftInPhase = ceil(cycle - pos)`, label `'REST'`. `totalRounds = rounds`. (The full work+rest cycle runs every round, so the timer ends after the final rest.)
- **done:** `phase 'done'`, `secondsLeftInPhase 0`, label `'DONE'`.

Pure, unit-tested.

## 2. Client component — `src/app/dashboard/timer/_components/timer.tsx`

A `'use client'` component:
- **Config:** mode tabs (`for_time` / `amrap` / `emom` / `intervals`) + per-mode number inputs (AMRAP minutes; EMOM interval + rounds; Intervals work/rest/rounds; For Time optional cap). Held in `useState`.
- **Controls:** Start / Pause / Reset. Pause-safe elapsed: keep `accumulatedMs` + a `runningSince` timestamp; `elapsed = (accumulatedMs + (running ? now - runningSince : 0)) / 1000`. Pause folds the running span into `accumulatedMs`.
- **Loop:** a 100ms `setInterval` (while running) recomputes `tick(config, elapsed)` into state and triggers beeps; cleared on pause/unmount; auto-stops at `phase === 'done'`.
- **Display:** big mono number — `secondsLeftInPhase` for countdown phases, `secondsElapsed` for `for_time` — formatted `m:ss`; a phase label + round indicator; background/accent **colored by phase** (lead-in amber, work lime, rest blue, done grey).
- **Audio:** a `beep(freqHz, ms)` helper over a lazily-created `AudioContext` (created on the first Start tap — satisfies the browser gesture requirement; guarded for SSR/no-AudioContext). The component diffs the previous `TimerState` vs the current to fire beeps: lead-in `secondsLeftInPhase` hitting 3/2/1 (short), transition into work (long "GO"), `round` increment in `emom` (beep), `phase` flip in `intervals` (beep), and transition to `done` (end beep). All audio is best-effort (wrapped so a blocked/absent AudioContext never throws).

## 3. Page + nav

- `src/app/dashboard/timer/page.tsx` — server component: `auth.getUser()` → `!user` redirect `'/'` (no role gate — everyone can use it), `Sidebar active="timer"`, renders `<Timer />` in the standard dashboard shell.
- `src/components/sidebar.tsx` — add a **"Timer"** entry to the **Athletes** nav section (visible to everyone): `{ key: 'timer', label: 'Timer', href: '/dashboard/timer', icon: 'clock' }`, and add a `clock` icon to the sidebar's icon map: `clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>`.

## 4. Testing

- **Pure `tick`** (`timer-engine.test.ts`): lead-in countdown (`secondsLeftInPhase` at elapsed 0 / 7 / 9.5; phase `leadin`); for_time count-up + cap → done; amrap countdown (`secondsLeftTotal`) + done at duration; emom round boundaries (round 1 at t=0, round 2 at t=interval, done at total) + `secondsLeftInPhase` within a minute; intervals work→rest→work transitions, round increments, and done after the last rest; the `done` shape. This is the bulk of the value.
- The component (interval + Web Audio) is verified by `npm run type-check` + `npm run build` (audio/timers aren't unit-tested).

## 5. Out of scope (YAGNI)

Saving timer presets · linking the timer to a specific WOD/score · voice cues or custom sounds · screen wake-lock · PWA/background persistence · multiple simultaneous timers · a tabata-specific preset (covered by generic intervals 20/10×8).

## File summary

| File | Type | Responsibility |
|---|---|---|
| `src/app/dashboard/timer/_lib/engine.ts` | create, pure | `TimerConfig`, `TimerState`, `tick`, `LEAD_IN_SECONDS` |
| `src/__tests__/timer-engine.test.ts` | create | `tick` unit tests |
| `src/app/dashboard/timer/_components/timer.tsx` | create, client | config + controls + display + beeps |
| `src/app/dashboard/timer/page.tsx` | create, server | gated page shell |
| `src/components/sidebar.tsx` | modify (+2) | "Timer" nav + `clock` icon |
