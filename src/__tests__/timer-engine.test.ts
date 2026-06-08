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
