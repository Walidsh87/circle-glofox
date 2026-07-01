import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { providerFor, createPackageCheckout, createProgramCheckout } = vi.hoisted(() => ({
  providerFor: vi.fn(),
  createPackageCheckout: vi.fn(),
  createProgramCheckout: vi.fn(),
}))
vi.mock('@/lib/psp', () => ({ getProviderForBox: providerFor }))

import { checkoutPackageViaApi, checkoutProgramViaApi } from '@/lib/api/checkout-core'

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
  providerFor.mockResolvedValue({ createPackageCheckout, createProgramCheckout })
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

// --- program checkout ---
const progArgs = { boxId: 'b1', athleteId: 'a1', templateId: 'tpl1', baseUrl: 'https://app.test' }

// member_programs is read twice: [published template, re-buy guard]. profiles supplies the email.
function progSvc(over: { tpl?: MockPair; owned?: MockPair } = {}) {
  const tpl = 'tpl' in over ? over.tpl! : { data: { id: 'tpl1', title: 'Strength 12wk', price_aed: 300 }, error: null }
  const owned = 'owned' in over ? over.owned! : { data: null, error: null }
  return makeSupabaseMock({
    results: {
      member_programs: [tpl, owned],
      profiles: { data: { email: 'm@test.ae' }, error: null },
    },
  })
}
type MockPair = { data: unknown; error: unknown }

test('published template, not owned → creates a program checkout and returns its url', async () => {
  createProgramCheckout.mockResolvedValue({ url: 'https://checkout.stripe/p', sessionId: 's2' })
  const res = await checkoutProgramViaApi(progSvc() as never, progArgs)
  expect(res).toEqual({ ok: true, url: 'https://checkout.stripe/p' })
  expect(createProgramCheckout).toHaveBeenCalledWith(expect.objectContaining({
    programTemplateId: 'tpl1', athleteId: 'a1', boxId: 'b1', priceAed: 300, customerEmail: 'm@test.ae',
  }))
})

test('no published template → not_found, provider never called', async () => {
  const res = await checkoutProgramViaApi(progSvc({ tpl: { data: null, error: null } }) as never, progArgs)
  expect(res).toEqual({ ok: false, code: 'not_found', message: expect.any(String) })
  expect(createProgramCheckout).not.toHaveBeenCalled()
})

test('free/zero-price template → not_found (not buyable)', async () => {
  const res = await checkoutProgramViaApi(progSvc({ tpl: { data: { id: 'tpl1', title: 'X', price_aed: 0 }, error: null } }) as never, progArgs)
  expect(res).toEqual({ ok: false, code: 'not_found', message: expect.any(String) })
  expect(createProgramCheckout).not.toHaveBeenCalled()
})

test('already owns an active copy → not_found, provider never called', async () => {
  const res = await checkoutProgramViaApi(progSvc({ owned: { data: { id: 'mine' }, error: null } }) as never, progArgs)
  expect(res).toEqual({ ok: false, code: 'not_found', message: expect.stringMatching(/already own/i) })
  expect(createProgramCheckout).not.toHaveBeenCalled()
})

test('provider failure → internal (not thrown)', async () => {
  createProgramCheckout.mockRejectedValue(new Error('stripe down'))
  const res = await checkoutProgramViaApi(progSvc() as never, progArgs)
  expect(res).toEqual({ ok: false, code: 'internal', message: expect.any(String) })
})
