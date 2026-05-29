import { z } from 'zod'

const waiverSignatureSchema = z.object({
  typedName: z.string().min(1),
  profileName: z.string().min(1),
})

export function validateWaiverSignature(
  checked: boolean,
  typedName: string,
  profileName: string
): string | null {
  if (!checked) return 'You must check the box to agree.'
  if (!typedName?.trim()) return 'Please type your full legal name.'
  if (!profileName?.trim()) return 'Your profile name is missing. Contact your gym owner.'
  const result = waiverSignatureSchema.safeParse({ typedName: typedName.trim(), profileName: profileName.trim() })
  if (!result.success) return 'Please type your full legal name.'
  if (typedName.trim().toLowerCase() !== profileName.trim().toLowerCase())
    return 'Name does not match your registered name.'
  return null
}

export function validateAgreements(
  waiverChecked: boolean,
  termsChecked: boolean,
  typedName: string,
  profileName: string,
  waiverAlreadySigned: boolean,
  termsAlreadySigned: boolean,
): string | null {
  if (!waiverAlreadySigned && !waiverChecked) return 'You must agree to the liability waiver.'
  if (!termsAlreadySigned && !termsChecked) return 'You must agree to the membership terms.'
  // Name match only required when at least one document still needs signing
  if (waiverAlreadySigned && termsAlreadySigned) return null
  if (!typedName?.trim()) return 'Please type your full legal name.'
  if (!profileName?.trim()) return 'Your profile name is missing. Contact your gym owner.'
  if (typedName.trim().toLowerCase() !== profileName.trim().toLowerCase())
    return 'Name does not match your registered name.'
  return null
}
