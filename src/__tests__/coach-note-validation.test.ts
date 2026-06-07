import { validateCoachNote } from '@/app/dashboard/prep/_lib/validation'

describe('validateCoachNote', () => {
  test('empty is allowed (clears the note)', () => {
    expect(validateCoachNote('')).toBeNull()
    expect(validateCoachNote('   ')).toBeNull()
  })
  test('a normal note is allowed', () => {
    expect(validateCoachNote('Bad shoulder — scale overhead to landmine press.')).toBeNull()
  })
  test('over 500 characters is rejected', () => {
    expect(validateCoachNote('x'.repeat(501))).toMatch(/500/)
  })
})
