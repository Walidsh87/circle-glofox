import { validateTemplateInput } from '@/app/dashboard/programming/_lib/validation'

describe('validateTemplateInput', () => {
  test('accepts a complete template', () => {
    expect(validateTemplateInput('Fran', '21-15-9 thrusters/pullups', 'time')).toBeNull()
  })
  test('rejects an empty title', () => {
    expect(validateTemplateInput('  ', 'desc', 'time')).toMatch(/title/i)
  })
  test('rejects an empty description', () => {
    expect(validateTemplateInput('Fran', '  ', 'time')).toMatch(/description/i)
  })
  test('rejects an invalid scoring type', () => {
    expect(validateTemplateInput('Fran', 'desc', 'bogus')).toMatch(/scoring/i)
  })
})
