import { describe, it, expect } from 'vitest'
import { loadRecipientLocales, loadRecipientLocalesByEmail } from './recipients'

function svcReturning(rows: unknown[]) {
  return { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: rows }) }) }) } as never
}

describe('loadRecipientLocales (by id)', () => {
  it('maps ids to resolved locales; unknown language → en', async () => {
    const m = await loadRecipientLocales(svcReturning([
      { id: 'a', language: 'ar' }, { id: 'b', language: 'en' }, { id: 'c', language: null },
    ]), ['a', 'b', 'c'])
    expect(m.get('a')).toBe('ar')
    expect(m.get('b')).toBe('en')
    expect(m.get('c')).toBe('en')
  })
  it('empty ids → empty map, no query', async () => {
    const m = await loadRecipientLocales(svcReturning([]), [])
    expect(m.size).toBe(0)
  })
})

describe('loadRecipientLocalesByEmail', () => {
  it('keys by lowercased email', async () => {
    const m = await loadRecipientLocalesByEmail(svcReturning([
      { email: 'A@B.CO', language: 'ar' },
    ]), ['A@B.CO'])
    expect(m.get('a@b.co')).toBe('ar')
  })
})
