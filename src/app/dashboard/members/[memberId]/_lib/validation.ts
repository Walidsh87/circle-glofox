export function validateSellPackageInput(packageId: string, athleteId: string): string | null {
  if (!packageId?.trim()) return 'Pick a package to sell.'
  if (!athleteId?.trim()) return 'Missing member.'
  return null
}

export function validateRedeemInput(creditId: string): string | null {
  if (!creditId?.trim()) return 'Missing credit batch.'
  return null
}
