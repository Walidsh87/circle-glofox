export function validateHouseholdName(name: string): string | null {
  const n = (name ?? '').trim()
  if (!n) return 'Household name is required.'
  if (n.length > 60) return 'Household name is too long (max 60 characters).'
  return null
}
