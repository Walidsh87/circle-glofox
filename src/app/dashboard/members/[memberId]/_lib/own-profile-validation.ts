import { normalizeUaePhone } from '@/lib/sms'
import { validateMemberFields } from './member-fields-validation'

export type OwnProfileInput = {
  phone: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  bloodType: string | null
  allergies: string | null
}

// The athlete's own phone must be a UAE mobile (it feeds SMS/WhatsApp matching);
// the emergency contact may be international — length rules only, same as the staff form.
export function validateOwnProfile(input: OwnProfileInput): string | null {
  if (input.phone && !normalizeUaePhone(input.phone)) return 'Enter a valid UAE phone number.'
  // dateOfBirth is not self-editable; with it null the `today` argument is unused.
  return validateMemberFields({ ...input, dateOfBirth: null }, '')
}
