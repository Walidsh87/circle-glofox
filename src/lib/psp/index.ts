import { createServiceClient } from '@/lib/supabase/service'
import { StripeProvider, type StripeCredentials } from './stripe-provider'
import { PspConfigError, type PaymentProvider, type ProviderKey } from './types'

export * from './types'
export { StripeProvider } from './stripe-provider'

type BoxRow = {
  psp_provider: ProviderKey | null
  psp_credentials: Record<string, unknown> | null
  stripe_secret_key: string | null
  stripe_webhook_secret: string | null
}

/**
 * Resolve the PaymentProvider configured for a box.
 *
 * Falls back to legacy `stripe_secret_key` columns when `psp_credentials` is unset —
 * this keeps existing Stripe-connected gyms working until migration 016 has been
 * applied AND the row has been touched. Remove the fallback in a follow-up.
 */
export async function getProviderForBox(boxId: string): Promise<PaymentProvider> {
  const service = createServiceClient()

  const { data: box } = await service
    .from('boxes')
    .select('psp_provider, psp_credentials, stripe_secret_key, stripe_webhook_secret')
    .eq('id', boxId)
    .single<BoxRow>()

  if (!box) throw new PspConfigError(`Box ${boxId} not found.`)

  const providerKey: ProviderKey = box.psp_provider ?? 'stripe'

  switch (providerKey) {
    case 'stripe': {
      const creds = (box.psp_credentials ?? {}) as Partial<StripeCredentials>
      const secretKey = creds.secret_key ?? box.stripe_secret_key
      const webhookSecret = creds.webhook_secret ?? box.stripe_webhook_secret
      if (!secretKey) throw new PspConfigError('Stripe secret key is not configured for this gym.')
      return new StripeProvider({ secret_key: secretKey, webhook_secret: webhookSecret ?? null })
    }
    default:
      throw new PspConfigError(`Provider "${providerKey}" is not implemented yet.`)
  }
}

/**
 * For webhook routing: try every connected box's provider until one verifies the signature.
 * Returns the matching box ID + provider, or null if no box's secret matches.
 */
export async function findProviderForIncomingWebhook(
  rawBody: string,
  headers: Headers,
): Promise<{ boxId: string; provider: PaymentProvider; event: NonNullable<Awaited<ReturnType<PaymentProvider['verifyAndParseWebhook']>>> } | null> {
  const service = createServiceClient()

  const { data: boxes } = await service
    .from('boxes')
    .select('id, psp_provider, psp_credentials, stripe_secret_key, stripe_webhook_secret')
    .or('psp_credentials.not.is.null,stripe_webhook_secret.not.is.null')

  if (!boxes?.length) return null

  for (const box of boxes) {
    try {
      const provider = await getProviderForBox(box.id)
      const event = await provider.verifyAndParseWebhook(rawBody, headers)
      if (event) return { boxId: box.id, provider, event }
    } catch {
      // signature mismatch or config error — try next box
    }
  }
  return null
}
