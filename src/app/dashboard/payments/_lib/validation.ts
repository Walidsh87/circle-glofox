export function validateMembershipInput(athleteId: string, planName: string, startDate: string): string | null {
  if (!athleteId || !planName?.trim() || !startDate) {
    return 'Athlete, plan name, and start date are required.'
  }
  return null
}

export function validateStripePlanInput(planName: string, priceAed: number): string | null {
  if (!planName?.trim()) return 'Plan name is required.'
  if (!priceAed || priceAed <= 0 || isNaN(priceAed)) return 'Enter a valid price.'
  return null
}

export function validateCheckoutGuards(
  membership: { stripe_price_id: string | null } | null,
  stripeSecretKey: string | null
): string | null {
  if (!membership) return 'Membership not found.'
  if (!membership.stripe_price_id) return 'No Stripe plan linked to this membership.'
  if (!stripeSecretKey) return 'Stripe is not connected.'
  return null
}
