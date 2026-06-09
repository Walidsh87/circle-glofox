import { addDays } from '@/lib/date-utils'

test('adds days within a month', () => expect(addDays('2026-06-01', 7)).toBe('2026-06-08'))
test('rolls over a month', () => expect(addDays('2026-06-28', 7)).toBe('2026-07-05'))
test('rolls over a year', () => expect(addDays('2026-12-30', 5)).toBe('2027-01-04'))
test('zero days is identity', () => expect(addDays('2026-06-01', 0)).toBe('2026-06-01'))
