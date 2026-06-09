export function validatePlan(
  name: string,
  monthlyPriceAed: number | null,
  providerPlanRef: string | null,
  isTrial: boolean = false,
  trialDays: number | null = null,
): string | null {
  if (!name?.trim()) return 'Plan name is required.'
  if (name.trim().length > 80) return 'Plan name is too long (max 80 characters).'
  if (monthlyPriceAed !== null && (!Number.isFinite(monthlyPriceAed) || monthlyPriceAed < 0)) {
    return 'Price must be zero or a positive amount.'
  }
  if (providerPlanRef !== null && providerPlanRef.length > 120) {
    return 'Stripe Price ID is too long.'
  }
  if (isTrial && (!Number.isInteger(trialDays) || (trialDays as number) < 1)) {
    return 'A trial plan needs a trial length in days.'
  }
  return null
}
