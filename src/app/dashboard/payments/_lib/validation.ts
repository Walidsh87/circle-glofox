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
  provider_plan_ref: z.string().min(1),
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
  membership: { provider_plan_ref: string | null } | null,
  providerConfigured: boolean
): string | null {
  if (!membership) return 'Membership not found.'
  const result = checkoutGuardsSchema.safeParse(membership)
  if (!result.success) return 'No payment plan linked to this membership.'
  if (!providerConfigured) return 'Payment provider is not connected.'
  return null
}
