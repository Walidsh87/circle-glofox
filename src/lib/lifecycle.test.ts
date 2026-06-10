import { test, expect } from 'vitest'
import { lifecycleStage, stageHint, STAGES, type LifecyclePerson } from './lifecycle'

function member(over: Partial<LifecyclePerson> = {}): LifecyclePerson {
  return { kind: 'member', membershipStatus: 'paid', isTrial: false, riskTier: 'none', ...over }
}

test('STAGES is the six stages in journey order', () => {
  expect(STAGES).toEqual(['lead', 'trial', 'active', 'at_risk', 'frozen', 'cancelled'])
})

test('lead new/contacted → lead; converted/lost → null', () => {
  expect(lifecycleStage({ kind: 'lead', leadStatus: 'new' })).toBe('lead')
  expect(lifecycleStage({ kind: 'lead', leadStatus: 'contacted' })).toBe('lead')
  expect(lifecycleStage({ kind: 'lead', leadStatus: 'converted' })).toBeNull()
  expect(lifecycleStage({ kind: 'lead', leadStatus: 'lost' })).toBeNull()
})

test('frozen wins over everything', () => {
  expect(lifecycleStage(member({ membershipStatus: 'frozen', isTrial: true, riskTier: 'high' }))).toBe('frozen')
})

test('no_membership → cancelled (before trial/risk)', () => {
  expect(lifecycleStage(member({ membershipStatus: 'no_membership', riskTier: 'high' }))).toBe('cancelled')
})

test('active trial → trial (even if unpaid or high risk)', () => {
  expect(lifecycleStage(member({ isTrial: true, membershipStatus: 'unpaid' }))).toBe('trial')
  expect(lifecycleStage(member({ isTrial: true, riskTier: 'high' }))).toBe('trial')
})

test('unpaid non-trial → at_risk', () => {
  expect(lifecycleStage(member({ membershipStatus: 'unpaid' }))).toBe('at_risk')
})

test('high risk paid non-trial → at_risk', () => {
  expect(lifecycleStage(member({ membershipStatus: 'paid', riskTier: 'high' }))).toBe('at_risk')
})

test('medium risk paid non-trial → active (only high surfaces)', () => {
  expect(lifecycleStage(member({ membershipStatus: 'paid', riskTier: 'medium' }))).toBe('active')
})

test('paid, no risk, non-trial → active', () => {
  expect(lifecycleStage(member({ membershipStatus: 'paid', riskTier: 'none' }))).toBe('active')
})

test('stageHint: lead uses source or falls back', () => {
  expect(stageHint({ stage: 'lead', leadSource: 'Instagram' })).toBe('Instagram')
  expect(stageHint({ stage: 'lead', leadSource: null })).toBe('new lead')
})

test('stageHint: trial shows end date', () => {
  expect(stageHint({ stage: 'trial', trialEndDate: '2026-06-14' })).toBe('trial ends 2026-06-14')
  expect(stageHint({ stage: 'trial', trialEndDate: null })).toBe('on trial')
})

test('stageHint: at_risk shows away days or never', () => {
  expect(stageHint({ stage: 'at_risk', daysSinceLastCheckIn: 18 })).toBe('away 18d')
  expect(stageHint({ stage: 'at_risk', daysSinceLastCheckIn: null })).toBe('never checked in')
})

test('stageHint: frozen and cancelled are fixed', () => {
  expect(stageHint({ stage: 'frozen' })).toBe('frozen')
  expect(stageHint({ stage: 'cancelled' })).toBe('no active plan')
})

test('stageHint: active shows expiry only when soon (≤14d)', () => {
  expect(stageHint({ stage: 'active', daysUntilExpiry: 5 })).toBe('expires in 5d')
  expect(stageHint({ stage: 'active', daysUntilExpiry: 40 })).toBe('')
  expect(stageHint({ stage: 'active', daysUntilExpiry: null })).toBe('')
})
