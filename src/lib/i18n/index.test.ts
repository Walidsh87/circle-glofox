import { resolveLocale, getDictionary, getT, LOCALES } from '@/lib/i18n'
import { en } from '@/lib/i18n/en'
import { ar } from '@/lib/i18n/ar'

test('resolveLocale normalizes to a valid Locale, default en', () => {
  expect(resolveLocale('ar')).toBe('ar')
  expect(resolveLocale('en')).toBe('en')
  expect(resolveLocale('fr')).toBe('en')
  expect(resolveLocale(null)).toBe('en')
  expect(resolveLocale(undefined)).toBe('en')
  expect(resolveLocale('')).toBe('en')
})

test('LOCALES is exactly en + ar', () => expect([...LOCALES]).toEqual(['en', 'ar']))

test('getDictionary returns the matching dictionary', () => {
  expect(getDictionary('en')).toBe(en)
  expect(getDictionary('ar')).toBe(ar)
})

// Runtime parity guard: TS `ar: typeof en` catches MISSING keys; this catches a
// stray cast and confirms identical key sets (it does NOT catch an English value
// left untranslated — that needs human review).
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}
test('en and ar have identical key sets', () =>
  expect(keyPaths(ar).sort()).toEqual(keyPaths(en).sort()))

test('getT looks up dot-paths and interpolates', () => {
  const t = getT('en')
  expect(t('schedule.title')).toBe('Book a Class')
  expect(t('schedule.whosComing', { n: 3 })).toBe("Who's coming (3)")
  expect(t('login.newToGym', { gym: 'Circle Fitness' })).toBe('New to Circle Fitness?')
  expect(t('does.not.exist')).toBe('does.not.exist') // missing key → returns the key
})

test('getT(ar) returns Arabic', () => expect(getT('ar')('schedule.title')).toBe('احجز حصة'))
