'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { getProviderForBox } from '@/lib/psp'
import { env } from '@/env'

type Cash = { error: string | null }
type Link = { error: string | null; url: string | null }

export async function deskRecordCash(membershipId: string): Promise<Cash> {
  const auth = await requireStaffAction('Only staff can take payment.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth
  const service = createServiceClient()

  const { data: mem } = await service
    .from('memberships')
    .select('id, box_id, plan_name, monthly_price_aed')
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)
    .single()
  if (!mem) return { error: 'Membership not found in your gym.' }

  const { error } = await service
    .from('memberships')
    .update({ payment_status: 'paid', last_paid_date: new Date().toISOString().slice(0, 10) })
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)
  if (error) return { error: 'Could not record the payment.' }

  await logAudit(service, {
    boxId: profile.box_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: 'desk.cash_recorded',
    target: membershipId,
    details: { plan: mem.plan_name, amount_aed: mem.monthly_price_aed != null ? Number(mem.monthly_price_aed) : null },
  })

  revalidatePath('/dashboard/desk')
  revalidatePath('/dashboard/payments')
  return { error: null }
}

export async function deskPaymentLink(membershipId: string): Promise<Link> {
  const auth = await requireStaffAction('Only staff can take payment.')
  if ('error' in auth) return { error: auth.error, url: null }
  const { user, profile } = auth
  const service = createServiceClient()

  const { data: m } = await service
    .from('memberships')
    .select('id, provider_plan_ref, provider_customer_ref, athlete_id, plan_name')
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)
    .single()
  if (!m) return { error: 'Membership not found in your gym.', url: null }
  if (!m.provider_plan_ref) return { error: 'No payment plan linked to this membership.', url: null }

  const { data: box } = await service.from('boxes').select('psp_credentials, stripe_secret_key').eq('id', profile.box_id).single()
  if (!(box?.psp_credentials || box?.stripe_secret_key)) return { error: 'Payment provider is not connected.', url: null }

  const { data: athlete } = await service.from('profiles').select('email, full_name').eq('id', m.athlete_id).eq('box_id', profile.box_id).single()

  try {
    const provider = await getProviderForBox(profile.box_id)
    let customerRef = m.provider_customer_ref
    if (!customerRef) {
      const created = await provider.createCustomer({ email: athlete?.email ?? null, name: athlete?.full_name ?? null, metadata: { membership_id: membershipId, box_id: profile.box_id } })
      customerRef = created.customerRef
      await service.from('memberships').update({ provider_customer_ref: customerRef }).eq('id', membershipId).eq('box_id', profile.box_id)
    }
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const session = await provider.createCheckoutSession({
      planRef: m.provider_plan_ref,
      customerRef,
      customerEmail: athlete?.email ?? null,
      successUrl: `${baseUrl}/dashboard/desk?paid=1`,
      cancelUrl: `${baseUrl}/dashboard/desk`,
      membershipId,
    })
    await logAudit(service, { boxId: profile.box_id, actorId: user.id, actorName: profile.full_name, action: 'desk.payment_link', target: membershipId, details: { plan: m.plan_name } })
    return { error: null, url: session.url }
  } catch (e) {
    console.error('deskPaymentLink failed:', e)
    return { error: "Could not create the payment link. Check the gym's payment settings.", url: null }
  }
}

export async function deskSellPackage(packageId: string, athleteId: string): Promise<Link> {
  const auth = await requireStaffAction('Only staff can sell packages.')
  if ('error' in auth) return { error: auth.error, url: null }
  const { user, profile } = auth
  const service = createServiceClient()

  const { data: pkg } = await service.from('packages').select('id, name, price_aed, active').eq('id', packageId).eq('box_id', profile.box_id).single()
  if (!pkg || !pkg.active) return { error: 'Package not found or inactive.', url: null }
  const { data: athlete } = await service.from('profiles').select('id, email').eq('id', athleteId).eq('box_id', profile.box_id).single()
  if (!athlete) return { error: 'Member not found in your gym.', url: null }

  try {
    const provider = await getProviderForBox(profile.box_id)
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const session = await provider.createPackageCheckout({
      packageId: pkg.id,
      athleteId: athlete.id,
      boxId: profile.box_id,
      packageName: pkg.name,
      priceAed: Number(pkg.price_aed),
      customerEmail: athlete.email ?? null,
      successUrl: `${baseUrl}/dashboard/desk?package=success`,
      cancelUrl: `${baseUrl}/dashboard/desk`,
    })
    await logAudit(service, { boxId: profile.box_id, actorId: user.id, actorName: profile.full_name, action: 'desk.package_sold', target: athleteId, details: { package: pkg.name } })
    return { error: null, url: session.url }
  } catch (e) {
    console.error('deskSellPackage failed:', e)
    return { error: "Could not create the payment link. Check the gym's payment settings.", url: null }
  }
}
