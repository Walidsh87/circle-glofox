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
