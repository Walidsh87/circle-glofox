import { validateStrengthPrescription } from '@/app/dashboard/wod/_lib/validation'

describe('validateStrengthPrescription', () => {
  const validSets = [{ sets: 5, reps: 3, percentage: 80 }]

  test('returns null when no lift is selected (no prescription)', () => {
    expect(validateStrengthPrescription('', [])).toBeNull()
  })

  test('returns null for a valid prescription', () => {
    expect(validateStrengthPrescription('back_squat', validSets)).toBeNull()
  })

  test('rejects a non-canonical lift', () => {
    expect(validateStrengthPrescription('not_a_lift', validSets)).not.toBeNull()
  })

  test('rejects a lift with no sets', () => {
    expect(validateStrengthPrescription('back_squat', [])).not.toBeNull()
  })

  test('rejects zero or negative reps/sets', () => {
    expect(validateStrengthPrescription('back_squat', [{ sets: 0, reps: 3, percentage: 80 }])).not.toBeNull()
    expect(validateStrengthPrescription('back_squat', [{ sets: 5, reps: -1, percentage: 80 }])).not.toBeNull()
  })

  test('rejects an out-of-range percentage', () => {
    expect(validateStrengthPrescription('back_squat', [{ sets: 5, reps: 3, percentage: 0 }])).not.toBeNull()
    expect(validateStrengthPrescription('back_squat', [{ sets: 5, reps: 3, percentage: 250 }])).not.toBeNull()
  })

  test('rejects malformed (non-array) sets', () => {
    expect(validateStrengthPrescription('back_squat', null)).not.toBeNull()
  })
})
