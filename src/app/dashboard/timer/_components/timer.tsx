'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { tick, type TimerConfig, type TimerState } from '../_lib/engine'

type Mode = TimerConfig['mode']

const MODES: { value: Mode; label: string }[] = [
  { value: 'for_time', label: 'For Time' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'emom', label: 'EMOM' },
  { value: 'intervals', label: 'Intervals' },
]

const PHASE_CLASS: Record<TimerState['phase'], string> = {
  leadin: 'text-warn',
  work: 'text-accent-ink',
  rest: 'text-ok',
  done: 'text-ink-3',
}

function fmt(total: number): string {
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const numInput =
  'h-[38px] w-[76px] rounded-lg border border-line-strong bg-surface px-2.5 text-center text-[15px] text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

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

  useEffect(() => {
    if (!running) return
    const beep = (freq: number, ms: number) => {
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
    const maybeBeep = (prev: TimerState | null, cur: TimerState) => {
      if (!prev) return
      if (cur.phase === 'leadin' && cur.secondsLeftInPhase !== prev.secondsLeftInPhase && cur.secondsLeftInPhase <= 3 && cur.secondsLeftInPhase >= 1) beep(880, 120)
      if (prev.phase === 'leadin' && cur.phase !== 'leadin' && cur.phase !== 'done') beep(1320, 500) // GO
      if (cur.phase !== 'leadin') {
        if (cur.round !== prev.round && cur.phase === 'work' && prev.phase === 'work') beep(1320, 200) // EMOM new round
        if (cur.phase !== prev.phase && prev.phase !== 'leadin' && (cur.phase === 'work' || cur.phase === 'rest')) beep(1100, 200) // intervals flip (not the GO transition)
        if (cur.phase === 'done' && prev.phase !== 'done') beep(660, 700) // end
      }
    }
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
  const phaseClass = !started ? 'text-ink' : PHASE_CLASS[state.phase]
  const subLabel = !started ? MODES.find((m) => m.value === mode)!.label : state.label

  return (
    <div className="flex w-full max-w-[520px] flex-col items-center gap-5">
      {/* Mode tabs */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            disabled={started}
            onClick={() => setMode(m.value)}
            className={cn(
              'h-[34px] rounded-lg border px-3.5 text-[13px] font-semibold text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              mode === m.value ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
              started ? 'cursor-default' : 'cursor-pointer',
              started && mode !== m.value && 'opacity-50'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Config inputs (hidden once started) */}
      {!started && (
        <div className="flex flex-wrap items-end justify-center gap-3.5">
          {mode === 'for_time' && (
            <Field label="Cap (min, 0=none)"><input type="number" min={0} value={capMin} onChange={(e) => setCapMin(Number(e.target.value))} className={numInput} /></Field>
          )}
          {mode === 'amrap' && (
            <Field label="Minutes"><input type="number" min={1} value={amrapMin} onChange={(e) => setAmrapMin(Number(e.target.value))} className={numInput} /></Field>
          )}
          {mode === 'emom' && (<>
            <Field label="Interval (s)"><input type="number" min={1} value={emomInterval} onChange={(e) => setEmomInterval(Number(e.target.value))} className={numInput} /></Field>
            <Field label="Rounds"><input type="number" min={1} value={emomRounds} onChange={(e) => setEmomRounds(Number(e.target.value))} className={numInput} /></Field>
          </>)}
          {mode === 'intervals' && (<>
            <Field label="Work (s)"><input type="number" min={1} value={work} onChange={(e) => setWork(Number(e.target.value))} className={numInput} /></Field>
            <Field label="Rest (s)"><input type="number" min={0} value={rest} onChange={(e) => setRest(Number(e.target.value))} className={numInput} /></Field>
            <Field label="Rounds"><input type="number" min={1} value={intervalRounds} onChange={(e) => setIntervalRounds(Number(e.target.value))} className={numInput} /></Field>
          </>)}
        </div>
      )}

      {/* Big display */}
      <div className="text-center">
        <div className={cn('font-mono text-[88px] font-bold leading-none tracking-[-0.03em]', phaseClass)}>{fmt(bigValue)}</div>
        <div className="mt-2 font-mono text-[15px] uppercase tracking-[0.08em] text-ink-3">
          {subLabel}{started && state.totalRounds > 1 && state.phase !== 'done' ? ` · round ${state.round}/${state.totalRounds}` : ''}
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2.5">
        {!started ? (
          <Button type="button" onClick={onStart} className="px-6 text-[15px] font-bold">Start</Button>
        ) : (<>
          {running
            ? <Button type="button" variant="outline" onClick={onPause} className="px-6 text-[15px] font-bold">Pause</Button>
            : <Button type="button" disabled={state.phase === 'done'} onClick={onResume} className="px-6 text-[15px] font-bold">Resume</Button>}
          <Button type="button" variant="outline" onClick={onReset} className="px-6 text-[15px] font-bold text-danger">Reset</Button>
        </>)}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{label}</span>
      {children}
    </label>
  )
}
