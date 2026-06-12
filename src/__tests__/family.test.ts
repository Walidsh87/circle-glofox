import { describe, test, expect } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { resolveBookingTarget } from '@/lib/family'
import type { SupabaseClient } from '@supabase/supabase-js'

const asClient = (m: ReturnType<typeof makeSupabaseMock>) => m as unknown as SupabaseClient

describe('resolveBookingTarget', () => {
  test('defaults to self without a target (no queries)', async () => {
    const mock = makeSupabaseMock({})
    expect(await resolveBookingTarget(asClient(mock), 'a1', null)).toEqual({ targetId: 'a1' })
    expect(mock.from).not.toHaveBeenCalled()
  })

  test('explicit self short-circuits', async () => {
    const mock = makeSupabaseMock({})
    expect(await resolveBookingTarget(asClient(mock), 'a1', 'a1')).toEqual({ targetId: 'a1' })
  })

  test('caller without a household is rejected', async () => {
    const mock = makeSupabaseMock({ results: { profiles: { data: { household_id: null }, error: null } } })
    expect(await resolveBookingTarget(asClient(mock), 'a1', 'a2'))
      .toEqual({ error: 'You are not part of a household.' })
  })

  test('target outside the household (or missing, or non-athlete) is rejected', async () => {
    const other = makeSupabaseMock({ results: { profiles: [
      { data: { household_id: 'h1' }, error: null },
      { data: { household_id: 'h2', role: 'athlete' }, error: null },
    ] } })
    expect(await resolveBookingTarget(asClient(other), 'a1', 'a2'))
      .toEqual({ error: 'That member is not in your household.' })

    const staff = makeSupabaseMock({ results: { profiles: [
      { data: { household_id: 'h1' }, error: null },
      { data: { household_id: 'h1', role: 'coach' }, error: null },
    ] } })
    expect(await resolveBookingTarget(asClient(staff), 'a1', 'a2'))
      .toEqual({ error: 'That member is not in your household.' })
  })

  test('same-household athlete resolves', async () => {
    const mock = makeSupabaseMock({ results: { profiles: [
      { data: { household_id: 'h1' }, error: null },
      { data: { household_id: 'h1', role: 'athlete' }, error: null },
    ] } })
    expect(await resolveBookingTarget(asClient(mock), 'a1', 'a2')).toEqual({ targetId: 'a2' })
  })
})
