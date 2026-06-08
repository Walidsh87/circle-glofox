# In-App Workout Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/dashboard/timer` workout timer (For Time / AMRAP / EMOM / Intervals) with a 10s lead-in and Web Audio beeps.

**Architecture:** All phase/round math is a pure `tick(config, elapsedSeconds)` function (unit-tested). A thin client `Timer` component drives it with a 100ms interval over pause-safe accumulated run-time, renders big phase-colored numbers, and beeps by diffing the previous vs current `tick` state. No backend, no migration, no deps.

**Tech Stack:** Next.js 16 (client component, server page shell), TypeScript strict, Vitest, Web Audio API. Reference spec: `docs/superpowers/specs/2026-06-08-workout-timer-design.md`.

**Conventions reused (read once):**
- Page shell + gate: `src/app/dashboard/prep/page.tsx` (any-logged-in variant: no role gate). Sidebar nav + icon map: `src/components/sidebar.tsx` (icons are a `Record<string, ReactNode>` of SVG fragments in a shared `<svg viewBox="0 0 24 24" stroke="currentColor">`). Tests FLAT in `src/__tests__/` (pure-fn style, e.g. `src/__tests__/programming-calendar.test.ts`).

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0` — zero warnings.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `src/app/dashboard/timer/_lib/engine.ts` | create, pure | `TimerConfig`, `TimerState`, `tick`, `LEAD_IN_SECONDS` |
| `src/__tests__/timer-engine.test.ts` | create | `tick` unit tests |
| `src/app/dashboard/timer/_components/timer.tsx` | create, client | config + controls + display + beeps |
| `src/app/dashboard/timer/page.tsx` | create, server | gated page shell |
| `src/components/sidebar.tsx` | modify (+2) | "Timer" nav + `clock` icon |

---

## Task 1: Pure timer engine

**Files:** Create `src/app/dashboard/timer/_lib/engine.ts`; Test `src/__tests__/timer-engine.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/timer-engine.test.ts`:

```ts
import { tick, LEAD_IN_SECONDS } from '@/app/dashboard/timer/_lib/engine'

describe('tick — lead-in', () => {
  test('counts down the 10s lead-in before any mode', () => {
    expect(tick({ mode: 'amrap', durationSeconds: 60 }, 0)).toMatchObject({ phase: 'leadin', secondsLeftInPhase: 10, round: 0 })
    expect(tick({ mode: 'amrap', durationSeconds: 60 }, 7).secondsLeftInPhase).toBe(3)
    expect(tick({ mode: 'amrap', durationSeconds: 60 }, 9.5).secondsLeftInPhase).toBe(1)
  })
})

describe('tick — for_time', () => {
  test('counts up after the lead-in', () => {
    expect(tick({ mode: 'for_time', capSeconds: null }, LEAD_IN_SECONDS + 5)).toMatchObject({ phase: 'work', secondsElapsed: 5, secondsLeftTotal: null })
  })
  test('is done at the cap', () => {
    expect(tick({ mode: 'for_time', capSeconds: 120 }, LEAD_IN_SECONDS + 120).phase).toBe('done')
  })
})

describe('tick — amrap', () => {
  test('counts down the duration', () => {
    expect(tick({ mode: 'amrap', durationSeconds: 60 }, LEAD_IN_SECONDS + 20).secondsLeftTotal).toBe(40)
  })
  test('is done at the duration', () => {
    expect(tick({ mode: 'amrap', durationSeconds: 60 }, LEAD_IN_SECONDS + 60).phase).toBe('done')
  })
})

describe('tick — emom', () => {
  test('round rolls over each interval', () => {
    const c = { mode: 'emom' as const, intervalSeconds: 60, rounds: 10 }
    expect(tick(c, LEAD_IN_SECONDS + 0).round).toBe(1)
    expect(tick(c, LEAD_IN_SECONDS + 60).round).toBe(2)
    expect(tick(c, LEAD_IN_SECONDS + 90).secondsLeftInPhase).toBe(30)
  })
  test('is done after all rounds', () => {
    expect(tick({ mode: 'emom', intervalSeconds: 60, rounds: 10 }, LEAD_IN_SECONDS + 600).phase).toBe('done')
  })
})

describe('tick — intervals', () => {
  const cfg = { mode: 'intervals' as const, workSeconds: 20, restSeconds: 10, rounds: 8 }
  test('work then rest within a round', () => {
    expect(tick(cfg, LEAD_IN_SECONDS + 5)).toMatchObject({ phase: 'work', round: 1, secondsLeftInPhase: 15 })
    expect(tick(cfg, LEAD_IN_SECONDS + 25)).toMatchObject({ phase: 'rest', round: 1, secondsLeftInPhase: 5 })
  })
  test('advances to the next round after a full cycle', () => {
    expect(tick(cfg, LEAD_IN_SECONDS + 30).round).toBe(2)
  })
  test('is done after the last rest', () => {
    expect(tick(cfg, LEAD_IN_SECONDS + 30 * 8).phase).toBe('done')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- timer-engine`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/app/dashboard/timer/_lib/engine.ts`:

```ts
export type TimerConfig =
  | { mode: 'for_time'; capSeconds: number | null }
  | { mode: 'amrap'; durationSeconds: number }
  | { mode: 'emom'; intervalSeconds: number; rounds: number }
  | { mode: 'intervals'; workSeconds: number; restSeconds: number; rounds: number }

export type TimerPhase = 'leadin' | 'work' | 'rest' | 'done'
export type TimerState = {
  phase: TimerPhase
  round: number
  totalRounds: number
  secondsLeftInPhase: number
  secondsElapsed: number
  secondsLeftTotal: number | null
  label: string
}

export const LEAD_IN_SECONDS = 10

function done(totalRounds: number, secondsElapsed = 0): TimerState {
  return { phase: 'done', round: totalRounds, totalRounds, secondsLeftInPhase: 0, secondsElapsed, secondsLeftTotal: 0, label: 'DONE' }
}

export function tick(config: TimerConfig, elapsed: number): TimerState {
  const totalRounds = config.mode === 'emom' || config.mode === 'intervals' ? config.rounds : 1

  if (elapsed < LEAD_IN_SECONDS) {
    return { phase: 'leadin', round: 0, totalRounds, secondsLeftInPhase: Math.ceil(LEAD_IN_SECONDS - elapsed), secondsElapsed: 0, secondsLeftTotal: null, label: 'GET READY' }
  }

  const t = elapsed - LEAD_IN_SECONDS

  if (config.mode === 'for_time') {
    if (config.capSeconds !== null && t >= config.capSeconds) return done(1, config.capSeconds)
    const left = config.capSeconds !== null ? Math.ceil(config.capSeconds - t) : 0
    return { phase: 'work', round: 1, totalRounds: 1, secondsLeftInPhase: left, secondsElapsed: Math.floor(t), secondsLeftTotal: config.capSeconds !== null ? left : null, label: 'GO' }
  }

  if (config.mode === 'amrap') {
    const rem = config.durationSeconds - t
    if (rem <= 0) return done(1)
    return { phase: 'work', round: 1, totalRounds: 1, secondsLeftInPhase: Math.ceil(rem), secondsElapsed: Math.floor(t), secondsLeftTotal: Math.ceil(rem), label: 'GO' }
  }

  if (config.mode === 'emom') {
    const total = config.intervalSeconds * config.rounds
    if (t >= total) return done(config.rounds)
    const round = Math.floor(t / config.intervalSeconds) + 1
    const into = t % config.intervalSeconds
    return { phase: 'work', round, totalRounds: config.rounds, secondsLeftInPhase: Math.ceil(config.intervalSeconds - into), secondsElapsed: Math.floor(t), secondsLeftTotal: null, label: `EMOM ${round}/${config.rounds}` }
  }

  // intervals
  const cycle = config.workSeconds + config.restSeconds
  const total = cycle * config.rounds
  if (t >= total) return done(config.rounds)
  const round = Math.floor(t / cycle) + 1
  const pos = t % cycle
  if (pos < config.workSeconds) {
    return { phase: 'work', round, totalRounds: config.rounds, secondsLeftInPhase: Math.ceil(config.workSeconds - pos), secondsElapsed: Math.floor(t), secondsLeftTotal: null, label: `WORK ${round}/${config.rounds}` }
  }
  return { phase: 'rest', round, totalRounds: config.rounds, secondsLeftInPhase: Math.ceil(cycle - pos), secondsElapsed: Math.floor(t), secondsLeftTotal: null, label: 'REST' }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- timer-engine`
Expected: PASS — all green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
git add src/app/dashboard/timer/_lib/engine.ts src/__tests__/timer-engine.test.ts
git commit -m "$(cat <<'EOF'
feat(timer): pure tick engine for For Time / AMRAP / EMOM / Intervals

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Timer component + page + nav

**Files:** Create `src/app/dashboard/timer/_components/timer.tsx`, `src/app/dashboard/timer/page.tsx`; Modify `src/components/sidebar.tsx`. No new tests (client UI; engine is unit-tested; verified by type-check + lint + build).

- [ ] **Step 1: Create the client component**

Create `src/app/dashboard/timer/_components/timer.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { tick, type TimerConfig, type TimerState } from '../_lib/engine'

type Mode = TimerConfig['mode']

const MODES: { value: Mode; label: string }[] = [
  { value: 'for_time', label: 'For Time' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'emom', label: 'EMOM' },
  { value: 'intervals', label: 'Intervals' },
]

const PHASE_COLOR: Record<TimerState['phase'], string> = {
  leadin: 'var(--c-warn-ink)',
  work: 'var(--circle-lime)',
  rest: 'var(--c-ok-ink)',
  done: 'var(--c-ink-muted)',
}

function fmt(total: number): string {
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const numInput: React.CSSProperties = {
  width: 76, height: 38, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)',
  background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 15, fontFamily: 'inherit', textAlign: 'center',
}
const ctrlBtn: React.CSSProperties = {
  height: 44, padding: '0 24px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

export function Timer() {
  const [mode, setMode] = useState<Mode>('amrap')
  const [amrapMin, setAmrapMin] = useState(20)
  const [capMin, setCapMin] = useState(0) // 0 = no cap
  const [emomInterval, setEmomInterval] = useState(60)
  const [emomRounds, setEmomRounds] = useState(10)
  const [work, setWork] = useState(20)
  const [rest, setRest] = useState(10)
  const [intervalRounds, setIntervalRounds] = useState(8)

  function buildConfig(): TimerConfig {
    switch (mode) {
      case 'for_time': return { mode, capSeconds: capMin > 0 ? capMin * 60 : null }
      case 'amrap': return { mode, durationSeconds: Math.max(1, amrapMin) * 60 }
      case 'emom': return { mode, intervalSeconds: Math.max(1, emomInterval), rounds: Math.max(1, emomRounds) }
      case 'intervals': return { mode, workSeconds: Math.max(1, work), restSeconds: Math.max(0, rest), rounds: Math.max(1, intervalRounds) }
    }
  }

  const [started, setStarted] = useState(false)
  const [running, setRunning] = useState(false)
  const [state, setState] = useState<TimerState>(() => tick({ mode: 'amrap', durationSeconds: 1200 }, 0))

  const accumulatedRef = useRef(0)   // ms accumulated while paused
  const runningSinceRef = useRef(0)  // timestamp of current run span
  const configRef = useRef<TimerConfig>(buildConfig())
  const prevStateRef = useRef<TimerState | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  function beep(freq: number, ms: number) {
    const ctx = audioRef.current
    if (!ctx) return
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.connect(gain); gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      osc.start()
      osc.stop(ctx.currentTime + ms / 1000)
    } catch { /* best effort */ }
  }

  function maybeBeep(prev: TimerState | null, cur: TimerState) {
    if (!prev) return
    if (cur.phase === 'leadin' && cur.secondsLeftInPhase !== prev.secondsLeftInPhase && cur.secondsLeftInPhase <= 3 && cur.secondsLeftInPhase >= 1) beep(880, 120)
    if (prev.phase === 'leadin' && cur.phase !== 'leadin' && cur.phase !== 'done') beep(1320, 500) // GO
    if (cur.phase !== 'leadin') {
      if (cur.round !== prev.round && cur.phase === 'work' && prev.phase === 'work') beep(1320, 200) // EMOM new round
      if (cur.phase !== prev.phase && (cur.phase === 'work' || cur.phase === 'rest')) beep(1100, 200) // intervals flip
      if (cur.phase === 'done' && prev.phase !== 'done') beep(660, 700) // end
    }
  }

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const elapsed = (accumulatedRef.current + (Date.now() - runningSinceRef.current)) / 1000
      const cur = tick(configRef.current, elapsed)
      maybeBeep(prevStateRef.current, cur)
      prevStateRef.current = cur
      setState(cur)
      if (cur.phase === 'done') {
        accumulatedRef.current += Date.now() - runningSinceRef.current
        setRunning(false)
      }
    }, 100)
    return () => clearInterval(id)
  }, [running])

  function onStart() {
    if (!audioRef.current) {
      const Ctor = typeof window !== 'undefined'
        ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined
      if (Ctor) audioRef.current = new Ctor()
    }
    audioRef.current?.resume().catch(() => {})
    configRef.current = buildConfig()
    prevStateRef.current = null
    runningSinceRef.current = Date.now()
    setStarted(true)
    setRunning(true)
  }
  function onResume() {
    audioRef.current?.resume().catch(() => {})
    runningSinceRef.current = Date.now()
    setRunning(true)
  }
  function onPause() {
    accumulatedRef.current += Date.now() - runningSinceRef.current
    setRunning(false)
  }
  function onReset() {
    accumulatedRef.current = 0
    prevStateRef.current = null
    setStarted(false)
    setRunning(false)
  }

  const bigValue = !started
    ? (mode === 'for_time' ? 0 : mode === 'amrap' ? Math.max(1, amrapMin) * 60 : mode === 'emom' ? Math.max(1, emomInterval) : Math.max(1, work))
    : mode === 'for_time' && state.phase !== 'leadin'
      ? state.secondsElapsed
      : state.secondsLeftInPhase
  const phaseColor = !started ? 'var(--c-ink)' : PHASE_COLOR[state.phase]
  const subLabel = !started ? MODES.find((m) => m.value === mode)!.label : state.label

  return (
    <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {MODES.map((m) => (
          <button key={m.value} type="button" disabled={started} onClick={() => setMode(m.value)} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${mode === m.value ? 'var(--circle-lime)' : 'var(--c-border)'}`, background: mode === m.value ? 'var(--circle-lime-soft)' : 'var(--c-surface)', fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', cursor: started ? 'default' : 'pointer', opacity: started && mode !== m.value ? 0.5 : 1, fontFamily: 'inherit' }}>{m.label}</button>
        ))}
      </div>

      {/* Config inputs (hidden once started) */}
      {!started && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end' }}>
          {mode === 'for_time' && (
            <Field label="Cap (min, 0=none)"><input type="number" min={0} value={capMin} onChange={(e) => setCapMin(Number(e.target.value))} style={numInput} /></Field>
          )}
          {mode === 'amrap' && (
            <Field label="Minutes"><input type="number" min={1} value={amrapMin} onChange={(e) => setAmrapMin(Number(e.target.value))} style={numInput} /></Field>
          )}
          {mode === 'emom' && (<>
            <Field label="Interval (s)"><input type="number" min={1} value={emomInterval} onChange={(e) => setEmomInterval(Number(e.target.value))} style={numInput} /></Field>
            <Field label="Rounds"><input type="number" min={1} value={emomRounds} onChange={(e) => setEmomRounds(Number(e.target.value))} style={numInput} /></Field>
          </>)}
          {mode === 'intervals' && (<>
            <Field label="Work (s)"><input type="number" min={1} value={work} onChange={(e) => setWork(Number(e.target.value))} style={numInput} /></Field>
            <Field label="Rest (s)"><input type="number" min={0} value={rest} onChange={(e) => setRest(Number(e.target.value))} style={numInput} /></Field>
            <Field label="Rounds"><input type="number" min={1} value={intervalRounds} onChange={(e) => setIntervalRounds(Number(e.target.value))} style={numInput} /></Field>
          </>)}
        </div>
      )}

      {/* Big display */}
      <div style={{ textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 88, fontWeight: 700, lineHeight: 1, color: phaseColor, letterSpacing: '-0.03em' }}>{fmt(bigValue)}</div>
        <div className="mono" style={{ fontSize: 15, color: 'var(--c-ink-muted)', marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {subLabel}{started && state.totalRounds > 1 && state.phase !== 'done' ? ` · round ${state.round}/${state.totalRounds}` : ''}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10 }}>
        {!started ? (
          <button type="button" onClick={onStart} style={{ ...ctrlBtn, background: 'var(--circle-lime)', color: 'var(--circle-ink)' }}>Start</button>
        ) : (<>
          {running
            ? <button type="button" onClick={onPause} style={{ ...ctrlBtn, background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', color: 'var(--c-ink-2)' }}>Pause</button>
            : <button type="button" disabled={state.phase === 'done'} onClick={onResume} style={{ ...ctrlBtn, background: 'var(--circle-lime)', color: 'var(--circle-ink)', opacity: state.phase === 'done' ? 0.5 : 1 }}>Resume</button>}
          <button type="button" onClick={onReset} style={{ ...ctrlBtn, background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', color: 'var(--c-danger)' }}>Reset</button>
        </>)}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {children}
    </label>
  )
}
```

- [ ] **Step 2: Create the page (server)**

Create `src/app/dashboard/timer/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { Timer } from './_components/timer'

export default async function TimerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="timer" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Timer</h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '40px 32px', display: 'grid', placeItems: 'center' }}>
          <Timer />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the nav entry + clock icon**

In `src/components/sidebar.tsx`:

(a) In the icon map (the `Record` of SVG fragments — near `monitor`/`activity`), add a `clock` entry:
```tsx
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
```

(b) In the **Athletes** section, immediately after the `schedule` push (`athleteItems.push({ key: 'schedule', ... })`), add:
```tsx
  athleteItems.push({ key: 'timer', label: 'Timer', href: '/dashboard/timer', icon: 'clock' })
```

- [ ] **Step 4: Type-check, lint, build, full suite**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 warnings.
Run: `npm run build` → succeeds and the route list includes `/dashboard/timer`.
Run: `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/timer/_components/timer.tsx src/app/dashboard/timer/page.tsx src/components/sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(timer): workout timer page + nav (For Time/AMRAP/EMOM/Intervals + beeps)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 warnings
- [ ] `npm test` → all green
- [ ] `npm run build` → succeeds, lists `/dashboard/timer`
- [ ] Dispatch a final code reviewer over the whole branch, then use `superpowers:finishing-a-development-branch`.

## Notes

- **No migration, no backend.** Nothing to deploy; the only pending migrations remain 028/029/030 from prior features.
- The pure `tick` engine holds all timing logic and is unit-tested; the component is a thin driver (interval + Web Audio), verified by build.
- Audio is best-effort: `AudioContext` is created on the Start tap (browser gesture rule) and every audio call is wrapped so a blocked/absent context never throws.
