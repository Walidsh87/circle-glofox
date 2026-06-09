import { normalizeTag, MAX_TAG_LEN } from '@/app/dashboard/members/[memberId]/_lib/tag'

test('trims surrounding whitespace', () => expect(normalizeTag('  VIP ')).toBe('VIP'))
test('collapses internal whitespace', () => expect(normalizeTag('found  ing   member')).toBe('found ing member'))
test('empty / whitespace → null', () => {
  expect(normalizeTag('')).toBeNull()
  expect(normalizeTag('   ')).toBeNull()
})
test('over the max length → null', () => expect(normalizeTag('x'.repeat(MAX_TAG_LEN + 1))).toBeNull())
test('a normal tag is unchanged', () => expect(normalizeTag('competitor')).toBe('competitor'))
