import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { providerFor, createPackageCheckout } = vi.hoisted(() => ({
  providerFor: vi.fn(),
  createPackageCheckout: vi.fn(),
}))
vi.mock('@/lib/psp', () => ({ getProviderForBox: providerFor }))

import { checkoutPackageViaApi } from '@/lib/api/checkout-core'

const args = { boxId: 'b1', athleteId: 'a1', packageId: 'pkg1', baseUrl: 'https://app.test' }

function svc(over: { pkg?: unknown } = {}) {
  return makeSupabaseMock({
    results: {
      packages: { data: 'pkg' in over ? over.pkg : { id: 'pkg1', name: '10-Class Pack', price_aed: 500 }, error: null },
      profiles: { data: { email: 'm@test.ae' }, error: null },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  providerFor.mockResolvedValue({ createPackageCheckout })
})

test('active package → creates a checkout session and returns its url', async () => {
  createPackageCheckout.mockResolvedValue({ url: 'https://checkout.stripe/x', sessionId: 's1' })
  const res = await checkoutPackageViaApi(svc() as never, args)
  expect(res).toEqual({ ok: true, url: 'https://checkout.stripe/x' })
  expect(createPackageCheckout).toHaveBeenCalledWith(expect.objectContaining({
    packageId: 'pkg1', athleteId: 'a1', boxId: 'b1', priceAed: 500, customerEmail: 'm@test.ae',
  }))
})

test('no active package → not_found, provider never called', async () => {
  const res = await checkoutPackageViaApi(svc({ pkg: null }) as never, args)
  expect(res).toEqual({ ok: false, code: 'not_found', message: expect.any(String) })
  expect(createPackageCheckout).not.toHaveBeenCalled()
})

test('provider failure → internal (not thrown)', async () => {
  createPackageCheckout.mockRejectedValue(new Error('stripe down'))
  const res = await checkoutPackageViaApi(svc() as never, args)
  expect(res).toEqual({ ok: false, code: 'internal', message: expect.any(String) })
})
