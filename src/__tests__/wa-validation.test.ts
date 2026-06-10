import { test, expect } from 'vitest'
import { validateWaTemplate, validateWaCampaign } from '@/app/dashboard/whatsapp/_lib/wa-validation'

const SID = 'HX' + 'a'.repeat(32)

test('validateWaTemplate accepts a well-formed template', () => {
  expect(validateWaTemplate('Welcome', SID, 'Hi {{1}}, welcome!', 1)).toBeNull()
})

test('validateWaTemplate rejects a malformed Content SID', () => {
  expect(validateWaTemplate('Welcome', 'SM123', 'Hi!', 0)).toMatch(/HX/)
})

test('validateWaTemplate rejects an empty name and out-of-range var count', () => {
  expect(validateWaTemplate('', SID, 'Hi!', 0)).toMatch(/name/i)
  expect(validateWaTemplate('Welcome', SID, 'Hi!', 6)).toMatch(/variable/i)
})

test('validateWaCampaign accepts filled slots and a valid audience', () => {
  expect(validateWaCampaign('t1', { '1': '{{first_name}}' }, 1, 'all')).toBeNull()
})

test('validateWaCampaign requires a template, every slot, and a valid audience', () => {
  expect(validateWaCampaign(null, {}, 0, 'all')).toMatch(/template/i)
  expect(validateWaCampaign('t1', { '1': 'x' }, 2, 'all')).toMatch(/\{\{2\}\}/)
  expect(validateWaCampaign('t1', {}, 0, 'everyone')).toMatch(/audience/i)
})
