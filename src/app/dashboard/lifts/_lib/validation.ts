export function validateLiftInput(liftName: string, weightKg: number): string | null {
  if (!liftName || isNaN(weightKg) || weightKg <= 0) {
    return 'Select a lift and enter a valid weight.'
  }
  return null
}
