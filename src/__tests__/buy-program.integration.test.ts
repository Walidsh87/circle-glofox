import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { getProvider, serverCreate } = vi.hoisted(() => ({ getProvider: vi.fn(), serverCreate: vi.fn() }))
vi.mock('@/lib/psp', async (orig) => ({ ...(await orig() as object), getProviderForBox: getProvider }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function load() {
  vi.resetModules()
  return (await import('@/app/dashboard/shop/_actions/buy-program')).buyProgram
}

const TPL = '11111111-1111-4111-8111-111111111111'

beforeEach(() => { getProvider.mockReset(); serverCreate.mockReset() })

describe('buyProgram', () => {
  it('rejects a non-athlete role', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({
      user: { id: 'u1' },
      results: { profiles: { data: { box_id: 'b1', email: 'c@x.com', role: 'coach' }, error: null } },
    }))
    const buyProgram = await load()
    const res = await buyProgram(TPL)
    expect(res.error).toMatch(/member/i)
    expect(res.url).toBeNull()
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('rejects when the published template is not found', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({
      user: { id: 'u1' },
      results: {
        profiles: { data: { box_id: 'b1', email: 'a@x.com', role: 'athlete' }, error: null },
        member_programs: [{ data: null, error: null }], // template lookup → none
      },
    }))
    const buyProgram = await load()
    const res = await buyProgram(TPL)
    expect(res.error).toMatch(/not available/i)
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('blocks a re-buy while an active copy exists', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({
      user: { id: 'u1' },
      results: {
        profiles: { data: { box_id: 'b1', email: 'a@x.com', role: 'athlete' }, error: null },
        member_programs: [
          { data: { id: TPL, title: '12-Week Squat', price_aed: 300 }, error: null }, // template lookup
          { data: { id: 'inst-1' }, error: null },                                     // active-instance check → owns it
        ],
      },
    }))
    const buyProgram = await load()
    const res = await buyProgram(TPL)
    expect(res.error).toMatch(/already own/i)
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('starts checkout at the server-stored price (buyer cannot tamper the amount)', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({
      user: { id: 'u1' },
      results: {
        profiles: { data: { box_id: 'b1', email: 'a@x.com', role: 'athlete' }, error: null },
        member_programs: [
          { data: { id: TPL, title: '12-Week Squat', price_aed: 300 }, error: null }, // template
          { data: null, error: null },                                                 // no active copy
        ],
      },
    }))
    const createProgramCheckout = vi.fn().mockResolvedValue({ url: 'https://stripe/checkout', sessionId: 'cs_1' })
    getProvider.mockResolvedValue({ createProgramCheckout })
    const buyProgram = await load()
    const res = await buyProgram(TPL)
    expect(res.error).toBeNull()
    expect(res.url).toBe('https://stripe/checkout')
    expect(createProgramCheckout).toHaveBeenCalledWith(expect.objectContaining({
      programTemplateId: TPL, athleteId: 'u1', boxId: 'b1', priceAed: 300,
    }))
  })
})
