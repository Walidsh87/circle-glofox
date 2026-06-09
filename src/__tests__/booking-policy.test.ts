import { bookingClosed, isLateCancel } from '@/lib/booking-policy'

const start = '2026-06-10T10:00:00Z'

describe('bookingClosed', () => {
  test('0 minutes → never closed', () => expect(bookingClosed(start, '2026-06-10T09:59:00Z', 0)).toBe(false))
  test('well before the window → open', () => expect(bookingClosed(start, '2026-06-10T08:00:00Z', 30)).toBe(false))
  test('inside the window → closed', () => expect(bookingClosed(start, '2026-06-10T09:45:00Z', 30)).toBe(true))
  test('after start → closed', () => expect(bookingClosed(start, '2026-06-10T10:30:00Z', 30)).toBe(true))
})

describe('isLateCancel', () => {
  test('0 hours → never late', () => expect(isLateCancel(start, '2026-06-10T09:00:00Z', 0)).toBe(false))
  test('inside the window → late', () => expect(isLateCancel(start, '2026-06-10T09:00:00Z', 2)).toBe(true))
  test('before the window → not late', () => expect(isLateCancel(start, '2026-06-10T07:00:00Z', 2)).toBe(false))
})
