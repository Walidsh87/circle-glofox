import { test, expect } from 'vitest'
import { generateReferralCode, referralLink, REFERRAL_ALPHABET } from './referrals'

test('generateReferralCode is 7 chars from the unambiguous alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateReferralCode()
    expect(code).toHaveLength(7)
    for (const ch of code) expect(REFERRAL_ALPHABET).toContain(ch)
  }
})

test('REFERRAL_ALPHABET excludes ambiguous characters', () => {
  for (const ch of '01OI') expect(REFERRAL_ALPHABET).not.toContain(ch)
})

test('referralLink builds the widget URL with the ref query', () => {
  expect(referralLink('https://app.example.com', 'crossfitx', 'ABC2345')).toBe('https://app.example.com/embed/lead/crossfitx?ref=ABC2345')
})
