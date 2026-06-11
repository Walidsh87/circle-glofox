import { test, expect } from 'vitest'
import { validateOwnProfile } from '@/app/dashboard/members/[memberId]/_lib/own-profile-validation'

const base = { phone: null, emergencyContactName: null, emergencyContactPhone: null, bloodType: null, allergies: null }

test('all empty is valid', () => {
  expect(validateOwnProfile(base)).toBeNull()
})

test('accepts local and international UAE numbers', () => {
  expect(validateOwnProfile({ ...base, phone: '0501234567' })).toBeNull()
  expect(validateOwnProfile({ ...base, phone: '+971 50 123 4567' })).toBeNull()
})

test('rejects a non-UAE own phone', () => {
  expect(validateOwnProfile({ ...base, phone: '12345' })).toBe('Enter a valid UAE phone number.')
})

test('emergency phone is free-form (international allowed) but length-capped', () => {
  expect(validateOwnProfile({ ...base, emergencyContactPhone: '+44 7700 900123' })).toBeNull()
  expect(validateOwnProfile({ ...base, emergencyContactPhone: 'x'.repeat(41) })).toBe('Emergency contact phone is too long.')
})

test('rejects an invalid blood type', () => {
  expect(validateOwnProfile({ ...base, bloodType: 'Z+' })).toBe('Invalid blood type.')
})

test('caps allergies at 1000 chars', () => {
  expect(validateOwnProfile({ ...base, allergies: 'a'.repeat(1001) })).toMatch(/too long/)
})
