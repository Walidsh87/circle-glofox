export const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateReferralCode(): string {
  let out = ''
  for (let i = 0; i < 7; i++) {
    out += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)]
  }
  return out
}

export function referralLink(appUrl: string, gymSlug: string, code: string): string {
  return `${appUrl}/embed/lead/${gymSlug}?ref=${code}`
}
