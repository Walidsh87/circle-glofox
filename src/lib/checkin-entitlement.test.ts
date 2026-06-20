import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeSupabaseMock, type MockResult } from '@/__tests__/helpers/supabase-mock'
import { assessCheckInEntitlement } from './checkin-entitlement'

const ARGS = { athleteId: 'a1', instanceId: 'i1', boxId: 'b1' }
const PAID = { payment_status: 'paid', end_date: null, last_paid_date: '2026-06-01', frozen_from: null, frozen_until: null }
const UNPAID = { payment_status: 'unpaid', end_date: null, last_paid_date: '2026-05-15', frozen_from: null, frozen_until: null }

const client = (results: Record<string, MockResult | MockResult[]>) =>
  makeSupabaseMock({ results }) as unknown as SupabaseClient

describe('assessCheckInEntitlement', () => {
  it('returns ok for a paid membership (no household, booking never queried)', async () => {
    const rls = makeSupabaseMock({
      results: { profiles: { data: { household_id: null }, error: null }, memberships: { data: [PAID], error: null } },
    })
    const service = makeSupabaseMock({ results: {} })
    const res = await assessCheckInEntitlement(
      rls as unknown as SupabaseClient,
      service as unknown as SupabaseClient,
      ARGS,
    )
    expect(res).toEqual({ status: 'ok' })
    expect(service.from).not.toHaveBeenCalledWith('bookings')
  })

  it("resolves entitlement through the household primary and queries the primary's memberships", async () => {
    const rls = makeSupabaseMock({
      results: {
        profiles: { data: { household_id: 'hh1' }, error: null },
        households: { data: { primary_athlete_id: 'primary1' }, error: null },
        memberships: { data: [PAID], error: null },
      },
    })
    const res = await assessCheckInEntitlement(
      rls as unknown as SupabaseClient,
      client({}),
      ARGS,
    )
    expect(res).toEqual({ status: 'ok' })
    // The memberships lookup must use the primary's id, not the dependent's.
    expect(rls.builder('memberships').eq).toHaveBeenCalledWith('athlete_id', 'primary1')
  })

  it('lets an unpaid member through when their booking is credit-backed', async () => {
    const res = await assessCheckInEntitlement(
      client({ profiles: { data: { household_id: null }, error: null }, memberships: { data: [UNPAID], error: null } }),
      client({ bookings: { data: { credit_id: 'cr1' }, error: null } }),
      ARGS,
    )
    expect(res).toEqual({ status: 'ok' })
  })

  it('blocks an unpaid member with no credit-backed booking, surfacing the last paid date', async () => {
    const res = await assessCheckInEntitlement(
      client({ profiles: { data: { household_id: null }, error: null }, memberships: { data: [UNPAID], error: null } }),
      client({ bookings: { data: null, error: null } }),
      ARGS,
    )
    expect(res).toEqual({ status: 'blocked', reason: 'unpaid', lastPaidDate: '2026-05-15' })
  })

  it('returns an error (not a silent block) when the booking lookup fails', async () => {
    const res = await assessCheckInEntitlement(
      client({ profiles: { data: { household_id: null }, error: null }, memberships: { data: [UNPAID], error: null } }),
      client({ bookings: { data: null, error: { message: 'boom' } } }),
      ARGS,
    )
    expect(res.status).toBe('error')
  })
})
