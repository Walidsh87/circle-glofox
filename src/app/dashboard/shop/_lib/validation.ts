export function validateBuyPackageInput(packageId: string): string | null {
  if (!packageId?.trim()) return 'Pick a package.'
  return null
}
