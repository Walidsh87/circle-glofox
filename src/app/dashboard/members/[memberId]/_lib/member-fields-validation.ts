export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

export type MemberFieldsInput = {
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  bloodType: string | null
  allergies: string | null
  dateOfBirth: string | null // 'YYYY-MM-DD' or null
}

// Human-readable error, or null when valid. Every field is optional.
export function validateMemberFields(input: MemberFieldsInput, today: string): string | null {
  const { emergencyContactName, emergencyContactPhone, bloodType, allergies, dateOfBirth } = input

  if (bloodType && !BLOOD_TYPES.includes(bloodType as (typeof BLOOD_TYPES)[number])) {
    return 'Invalid blood type.'
  }
  if (dateOfBirth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return 'Invalid date of birth.'
    const t = Date.parse(dateOfBirth + 'T00:00:00Z')
    // Reject impossible calendar dates (Date.parse normalizes e.g. Feb 30 → Mar 2).
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== dateOfBirth) return 'Invalid date of birth.'
    if (dateOfBirth > today) return 'Date of birth cannot be in the future.'
    if (Number(dateOfBirth.slice(0, 4)) < 1900) return 'Date of birth is too far in the past.'
  }
  if (emergencyContactName && emergencyContactName.length > 120) return 'Emergency contact name is too long.'
  if (emergencyContactPhone && emergencyContactPhone.length > 40) return 'Emergency contact phone is too long.'
  if (allergies && allergies.length > 1000) return 'Allergies note is too long (max 1000 characters).'
  return null
}
