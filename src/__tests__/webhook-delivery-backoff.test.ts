import { describe, test, expect } from 'vitest'
import { MAX_WEBHOOK_ATTEMPTS, backoffSeconds } from '@/lib/webhooks/delivery-backoff'

describe('MAX_WEBHOOK_ATTEMPTS', () => {
  test('is 8', () => {
    expect(MAX_WEBHOOK_ATTEMPTS).toBe(8)
  })
})

describe('backoffSeconds', () => {
  test('attempt 1 → 60', () => {
    expect(backoffSeconds(1)).toBe(60)
  })
  test('attempt 2 → 120', () => {
    expect(backoffSeconds(2)).toBe(120)
  })
  test('attempt 3 → 240', () => {
    expect(backoffSeconds(3)).toBe(240)
  })
  test('attempt 4 → 480', () => {
    expect(backoffSeconds(4)).toBe(480)
  })
  test('grows then caps at 21600 (6h) for large attempts', () => {
    expect(backoffSeconds(9)).toBe(15360)
    expect(backoffSeconds(10)).toBe(21600)
    expect(backoffSeconds(100)).toBe(21600)
  })
  test('attempt 0 is treated as 1 → 60', () => {
    expect(backoffSeconds(0)).toBe(60)
  })
  test('a negative attempt is treated as 1 → 60', () => {
    expect(backoffSeconds(-5)).toBe(60)
  })
})
