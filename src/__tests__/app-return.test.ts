import { test, expect } from 'vitest'
import { DEFAULT_APP_RETURN, resolveAppTarget } from '@/lib/app-return'

test('accepts the standalone scheme exactly', () => {
  expect(resolveAppTarget('circlefitness://checkout-return')).toBe('circlefitness://checkout-return')
})

test('accepts Expo Go / dev-client return URLs', () => {
  expect(resolveAppTarget('exp://192.168.1.5:8081/--/checkout-return')).toBe('exp://192.168.1.5:8081/--/checkout-return')
  expect(resolveAppTarget('exps://u.expo.dev/update/abc/--/checkout-return')).toBe('exps://u.expo.dev/update/abc/--/checkout-return')
})

test('rejects http(s) and junk — no open redirect through the bounce page', () => {
  expect(resolveAppTarget('https://evil.example/phish')).toBe(DEFAULT_APP_RETURN)
  expect(resolveAppTarget('http://localhost/--/checkout-return')).toBe(DEFAULT_APP_RETURN)
  expect(resolveAppTarget('javascript:alert(1)')).toBe(DEFAULT_APP_RETURN)
  expect(resolveAppTarget('circlefitness://somewhere-else')).toBe(DEFAULT_APP_RETURN)
  expect(resolveAppTarget('exp://host/--/checkout-return?status=x')).toBe(DEFAULT_APP_RETURN) // no query allowed
  expect(resolveAppTarget(42)).toBe(DEFAULT_APP_RETURN)
  expect(resolveAppTarget(undefined)).toBe(DEFAULT_APP_RETURN)
  expect(resolveAppTarget('exp://' + 'a'.repeat(400) + '/--/checkout-return')).toBe(DEFAULT_APP_RETURN) // length cap
})
