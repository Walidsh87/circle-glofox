import { describe, it, expect } from 'vitest'
import { buildOnboardingSteps, onboardingComplete, onboardingProgress, type OnboardingSignals } from '@/lib/onboarding'

const ALL_FALSE: OnboardingSignals = { hasStripe: false, hasClassTemplate: false, hasWod: false, hasStaff: false, hasMember: false, hasPlan: false, hasBranding: false }

describe('onboarding', () => {
  it('builds one step per signal, each done mirroring its signal', () => {
    const steps = buildOnboardingSteps({ ...ALL_FALSE, hasMember: true, hasBranding: true })
    expect(steps.length).toBe(7)
    expect(steps.find((s) => s.key === 'member')?.done).toBe(true)
    expect(steps.find((s) => s.key === 'branding')?.done).toBe(true)
    expect(steps.find((s) => s.key === 'stripe')?.done).toBe(false)
    for (const s of steps) { expect(s.href.startsWith('/dashboard/')).toBe(true); expect(s.helpTopic.length).toBeGreaterThan(0); expect(s.label.length).toBeGreaterThan(0) }
  })
  it('onboardingComplete is true only when every step is done', () => {
    expect(onboardingComplete(buildOnboardingSteps(ALL_FALSE))).toBe(false)
    const allDone: OnboardingSignals = { hasStripe: true, hasClassTemplate: true, hasWod: true, hasStaff: true, hasMember: true, hasPlan: true, hasBranding: true }
    expect(onboardingComplete(buildOnboardingSteps(allDone))).toBe(true)
  })
  it('onboardingProgress counts done/total', () => {
    const p = onboardingProgress(buildOnboardingSteps({ ...ALL_FALSE, hasMember: true, hasWod: true }))
    expect(p).toEqual({ done: 2, total: 7 })
  })
})
