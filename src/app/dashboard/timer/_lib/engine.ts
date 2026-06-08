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
