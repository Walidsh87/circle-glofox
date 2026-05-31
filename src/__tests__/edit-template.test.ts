import { validateEditTemplateInput } from '@/app/dashboard/classes/_lib/validation'

describe('validateEditTemplateInput', () => {
  test('returns error when name is empty', () => {
    expect(validateEditTemplateInput('', '06:00', 1)).toBe('Name, weekday, and start time are required.')
  })

  test('returns error when name is whitespace only', () => {
    expect(validateEditTemplateInput('   ', '06:00', 1)).toBe('Name, weekday, and start time are required.')
  })

  test('returns error when startTime is empty', () => {
    expect(validateEditTemplateInput('CrossFit 6AM', '', 1)).toBe('Name, weekday, and start time are required.')
  })

  test('returns error when weekday is NaN', () => {
    expect(validateEditTemplateInput('CrossFit 6AM', '06:00', NaN)).toBe('Name, weekday, and start time are required.')
  })

  test('returns null for valid inputs', () => {
    expect(validateEditTemplateInput('CrossFit 6AM', '06:00', 1)).toBeNull()
  })

  test('returns null for weekday 0 (Sunday)', () => {
    expect(validateEditTemplateInput('Sunday Yoga', '09:00', 0)).toBeNull()
  })

  test('returns null for weekday 6 (Saturday)', () => {
    expect(validateEditTemplateInput('Saturday WOD', '08:00', 6)).toBeNull()
  })
})
