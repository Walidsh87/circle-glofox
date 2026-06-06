const TYPES = ['class_pack', 'drop_in', 'pt_block'] as const

export function validatePackageInput(
  name: string,
  type: string,
  creditCount: number,
  priceAed: number,
  expiryDays: number | null
): string | null {
  if (!name?.trim()) return 'Package name is required.'
  if (!TYPES.includes(type as (typeof TYPES)[number])) return 'Invalid package type.'
  if (!Number.isInteger(creditCount) || creditCount < 1) {
    return 'Credit count must be a whole number of at least 1.'
  }
  if (type === 'drop_in' && creditCount !== 1) {
    return 'A drop-in pass must have exactly 1 credit.'
  }
  if (!Number.isFinite(priceAed) || priceAed < 0) {
    return 'Price must be zero or a positive amount.'
  }
  if (expiryDays !== null && (!Number.isInteger(expiryDays) || expiryDays < 1)) {
    return 'Expiry days must be a whole number of at least 1, or empty for no expiry.'
  }
  return null
}
