import { z } from 'zod'

const membershipSchema = z.object({
  athleteId: z.string().min(1),
  planName: z.string().min(1),
  startDate: z.string().min(1),
})

const stripePlanSchema = z.object({
  planName: z.string().min(1),
  priceAed: z.number().positive().finite(),
})

const checkoutGuardsSchema = z.object({
  stripe_price_id: z.string().min(1),
})

export function validateMembershipInput(athleteId: string, planName: string, startDate: string): string | null {
  const result = membershipSchema.safeParse({ athleteId, planName: planName?.trim(), startDate })
  if (!result.success) return 'Athlete, plan name, and start date are required.'
  return null
}

export function validateStripePlanInput(planName: string, priceAed: number): string | null {
  if (!planName?.trim()) return 'Plan name is required.'
  const result = stripePlanSchema.safeParse({ planName: planName.trim(), priceAed })
  if (!result.success) return 'Enter a valid price.'
  return null
}

export function validateCheckoutGuards(
  membership: { stripe_price_id: string | null } | null,
  stripeSecretKey: string | null
): string | null {
  if (!membership) return 'Membership not found.'
  const result = checkoutGuardsSchema.safeParse(membership)
  if (!result.success) return 'No Stripe plan linked to this membership.'
  if (!stripeSecretKey) return 'Stripe is not connected.'
  return null
}
