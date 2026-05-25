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
