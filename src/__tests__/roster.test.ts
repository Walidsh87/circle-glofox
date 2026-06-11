import { test, expect } from 'vitest'
import { rosterFirstNames } from '@/lib/roster'

test('takes the first name token of each booked athlete, in order', () => {
  expect(rosterFirstNames(['Sara Al Marri', 'Walid Shtaiwi', '  Omar  '])).toEqual(['Sara', 'Walid', 'Omar'])
})

test('falls back to Member for null or empty names', () => {
  expect(rosterFirstNames([null, '', 'Lena K'])).toEqual(['Member', 'Member', 'Lena'])
})
