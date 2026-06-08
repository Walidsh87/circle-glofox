import { buildParsePrompt, extractBlockText } from '@/app/dashboard/programming/_lib/ai-prompt'

describe('buildParsePrompt', () => {
  test('system teaches the block format + scoring words; user carries the freeform', () => {
    const { system, user } = buildParsePrompt('Mon Fran 21-15-9', '2026-07-01')
    expect(system).toMatch(/YYYY-MM-DD/)
    expect(system).toContain('For Time')
    expect(system).toContain('AMRAP')
    expect(system).toContain('Rounds + Reps')
    expect(system).toContain('Load')
    expect(system).toMatch(/blank line/i)
    expect(system).toMatch(/code fence/i)
    expect(system).toContain('2026-07-01') // today injected for relative-day resolution
    expect(user).toBe('Mon Fran 21-15-9')
  })
})

describe('extractBlockText', () => {
  test('strips a surrounding markdown code fence', () => {
    expect(extractBlockText('```\n2026-07-01 For Time\nFran\n21-15-9\n```')).toBe('2026-07-01 For Time\nFran\n21-15-9')
  })
  test('strips a language-tagged fence', () => {
    expect(extractBlockText('```text\nFran\n```')).toBe('Fran')
  })
  test('passes plain block text through, trimmed', () => {
    expect(extractBlockText('  2026-07-01 For Time\nFran  ')).toBe('2026-07-01 For Time\nFran')
  })
  test('empty stays empty', () => {
    expect(extractBlockText('')).toBe('')
  })
})
