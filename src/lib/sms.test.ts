import { test, expect } from 'vitest'
import { normalizeUaePhone, smsSegments, renderSmsBody, selectSmsRecipients, type SmsCandidate } from './sms'

test('normalizeUaePhone handles common UAE formats', () => {
  expect(normalizeUaePhone('050 123 4567')).toBe('+971501234567')
  expect(normalizeUaePhone('+971501234567')).toBe('+971501234567')
  expect(normalizeUaePhone('971501234567')).toBe('+971501234567')
  expect(normalizeUaePhone('501234567')).toBe('+971501234567')
  expect(normalizeUaePhone('00971501234567')).toBe('+971501234567')
})

test('normalizeUaePhone rejects invalid / non-UAE numbers', () => {
  expect(normalizeUaePhone('12345')).toBeNull()
  expect(normalizeUaePhone('+1 555 123 4567')).toBeNull()
  expect(normalizeUaePhone('abc')).toBeNull()
  expect(normalizeUaePhone(null)).toBeNull()
  expect(normalizeUaePhone('041234567')).toBeNull() // landline (04), not a 5x mobile
})

test('smsSegments counts GSM-7 boundaries', () => {
  expect(smsSegments('')).toEqual({ chars: 0, segments: 0, encoding: 'gsm7' })
  expect(smsSegments('a'.repeat(160))).toEqual({ chars: 160, segments: 1, encoding: 'gsm7' })
  expect(smsSegments('a'.repeat(161))).toEqual({ chars: 161, segments: 2, encoding: 'gsm7' })
})

test('smsSegments switches to unicode for Arabic and counts 70/seg', () => {
  const r1 = smsSegments('م'.repeat(70))
  expect(r1.encoding).toBe('unicode')
  expect(r1.segments).toBe(1)
  expect(smsSegments('م'.repeat(71)).segments).toBe(2)
})

test('renderSmsBody replaces every {{first_name}}', () => {
  expect(renderSmsBody('Hi {{first_name}}, see you {{first_name}}', { firstName: 'Sara' })).toBe('Hi Sara, see you Sara')
})

function cand(over: Partial<SmsCandidate>): SmsCandidate {
  return { athlete_id: 'a', email: null, full_name: 'A', marketing_opt_out: false, membershipStatus: 'paid', isTrial: false, tags: [], phone: '0501234567', ...over }
}

test('selectSmsRecipients includes matching members with a normalized phone', () => {
  const res = selectSmsRecipients([cand({ athlete_id: 'm1', full_name: 'Amy', phone: '050 111 2222' })], { status: 'all', tag: null })
  expect(res.included).toEqual([{ athlete_id: 'm1', full_name: 'Amy', phone: '+971501112222' }])
  expect(res.skippedOptedOut).toBe(0)
  expect(res.skippedNoPhone).toBe(0)
})

test('selectSmsRecipients skips opted-out and unparseable phones', () => {
  const res = selectSmsRecipients([
    cand({ athlete_id: 'o', marketing_opt_out: true }),
    cand({ athlete_id: 'n', phone: 'not a phone' }),
    cand({ athlete_id: 'p', phone: null }),
  ], { status: 'all', tag: null })
  expect(res.included).toEqual([])
  expect(res.skippedOptedOut).toBe(1)
  expect(res.skippedNoPhone).toBe(2)
})

test('selectSmsRecipients respects segment + tag', () => {
  const res = selectSmsRecipients([
    cand({ athlete_id: 'paid', membershipStatus: 'paid', tags: ['vip'] }),
    cand({ athlete_id: 'unpaid', membershipStatus: 'unpaid', tags: ['vip'] }),
  ], { status: 'paid', tag: 'vip' })
  expect(res.included.map((r) => r.athlete_id)).toEqual(['paid'])
})
