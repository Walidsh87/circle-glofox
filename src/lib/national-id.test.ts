import {
  validateIdDocument,
  idChecksumWarning,
  normalizeIdNumber,
  formatIdNumber,
  emiratesChecksumOk,
  ID_TYPES,
  ID_TYPE_LABELS,
} from '@/lib/national-id'

const today = '2026-06-13'
const VALID_EID = '784199012345676' // passes Luhn
const BADSUM_EID = '784199012345670' // same structure, fails Luhn

test('empty number is valid for every type', () => {
  for (const t of ID_TYPES) expect(validateIdDocument(t, '', today)).toBeNull()
  expect(validateIdDocument('emirates_id', null, today)).toBeNull()
})

test('valid Emirates ID (dashed input) → null', () =>
  expect(validateIdDocument('emirates_id', '784-1990-1234567-6', today)).toBeNull())

test('Emirates ID wrong length → error', () =>
  expect(validateIdDocument('emirates_id', '78419901234', today)).toMatch(/emirates id/i))

test('Emirates ID not starting 784 → error', () =>
  expect(validateIdDocument('emirates_id', '123199012345676', today)).toMatch(/emirates id/i))

test('Emirates ID with impossible birth-year segment → error', () =>
  expect(validateIdDocument('emirates_id', '784999912345676', today)).toMatch(/emirates id/i))

test('bad-checksum Emirates ID still passes hard validation (never blocks a real ID)', () =>
  expect(validateIdDocument('emirates_id', BADSUM_EID, today)).toBeNull())

test('checksum warning only when structure ok but Luhn fails', () => {
  expect(idChecksumWarning('emirates_id', BADSUM_EID)).toMatch(/check digit/i)
  expect(idChecksumWarning('emirates_id', VALID_EID)).toBeNull()
  expect(idChecksumWarning('emirates_id', '78419')).toBeNull() // malformed → hard validation's job
  expect(idChecksumWarning('passport', 'AB123456')).toBeNull()
})

test('Iqama: 10 digits starting 1 or 2', () => {
  expect(validateIdDocument('iqama', '2123456789', today)).toBeNull()
  expect(validateIdDocument('iqama', '1123456789', today)).toBeNull()
  expect(validateIdDocument('iqama', '3123456789', today)).toMatch(/iqama/i)
  expect(validateIdDocument('iqama', '212345', today)).toMatch(/iqama/i)
})

test('Passport: 5–20 alphanumeric', () => {
  expect(validateIdDocument('passport', 'ab123456', today)).toBeNull()
  expect(validateIdDocument('passport', 'A1', today)).toMatch(/passport/i)
  expect(validateIdDocument('passport', 'A!2345', today)).toMatch(/passport/i)
})

test('Other: free text up to 40 chars', () => {
  expect(validateIdDocument('other', 'GCC-12345', today)).toBeNull()
  expect(validateIdDocument('other', 'x'.repeat(41), today)).toMatch(/too long/i)
})

test('unknown type with a number → pick a type', () =>
  expect(validateIdDocument('passport_xx', 'A12345', today)).toMatch(/pick an id type/i))

test('normalizeIdNumber strips separators for digit IDs, uppercases documents', () => {
  expect(normalizeIdNumber('emirates_id', '784-1990-1234567-6')).toBe('784199012345676')
  expect(normalizeIdNumber('passport', ' ab123 ')).toBe('AB123')
})

test('formatIdNumber groups Emirates ID, leaves others unchanged', () => {
  expect(formatIdNumber('emirates_id', '784199012345676')).toBe('784-1990-1234567-6')
  expect(formatIdNumber('passport', 'ab12345')).toBe('AB12345')
})

test('emiratesChecksumOk sanity', () => {
  expect(emiratesChecksumOk(VALID_EID)).toBe(true)
  expect(emiratesChecksumOk(BADSUM_EID)).toBe(false)
})

test('every type has a label', () => {
  for (const t of ID_TYPES) expect(ID_TYPE_LABELS[t]).toBeTruthy()
})
