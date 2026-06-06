export function validateSellPackageInput(packageId: string, athleteId: string): string | null {
  if (!packageId?.trim()) return 'Pick a package to sell.'
  if (!athleteId?.trim()) return 'Missing member.'
  return null
}
