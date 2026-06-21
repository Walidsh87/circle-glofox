export function validateBuyPackageInput(packageId: string): string | null {
  if (!packageId?.trim()) return 'Pick a package.'
  return null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateBuyProgramInput(templateId: string): string | null {
  if (!templateId || !UUID_RE.test(templateId)) return 'Invalid program.'
  return null
}
