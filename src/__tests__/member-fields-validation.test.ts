import { validateMemberFields, BLOOD_TYPES } from '@/app/dashboard/members/[memberId]/_lib/member-fields-validation'

const base = { emergencyContactName: null, emergencyContactPhone: null, bloodType: null, allergies: null, dateOfBirth: null }
const today = '2026-06-09'

test('all null → valid', () => expect(validateMemberFields(base, today)).toBeNull())
test('valid full set → null', () =>
  expect(validateMemberFields({ emergencyContactName: 'Mum', emergencyContactPhone: '+971500000000', bloodType: 'O+', allergies: 'Peanuts', dateOfBirth: '1990-05-01' }, today)).toBeNull())
test('all 8 blood types accepted', () => {
  for (const b of BLOOD_TYPES) expect(validateMemberFields({ ...base, bloodType: b }, today)).toBeNull()
})
test('bad blood type → error', () => expect(validateMemberFields({ ...base, bloodType: 'Z+' }, today)).toMatch(/blood type/i))
test('future DOB → error', () => expect(validateMemberFields({ ...base, dateOfBirth: '2030-01-01' }, today)).toMatch(/future/i))
test('malformed date → error', () => expect(validateMemberFields({ ...base, dateOfBirth: '01-01-1990' }, today)).toMatch(/date of birth/i))
test('impossible calendar date → error', () => expect(validateMemberFields({ ...base, dateOfBirth: '2026-02-30' }, today)).toMatch(/date of birth/i))
test('year before 1900 → error', () => expect(validateMemberFields({ ...base, dateOfBirth: '1899-12-31' }, today)).toMatch(/past/i))
test('over-long allergies → error', () => expect(validateMemberFields({ ...base, allergies: 'x'.repeat(1001) }, today)).toMatch(/too long/i))
