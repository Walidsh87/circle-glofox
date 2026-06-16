'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { getMembershipStatus } from '@/lib/membership-status'
import { rankPeopleResults, type MemberRow, type LeadRow, type PersonHit } from '../_lib/search'

type State = { error: string | null; hits?: PersonHit[] }

export async function searchPeople(query: string): Promise<State> {
  const q = (query ?? '').trim()
  const auth = await requireStaffAction('Only staff can use the front desk.')
  if ('error' in auth) return { error: auth.error }
  if (q.length < 1) return { error: null, hits: [] }

  const { supabase, profile } = auth
  const boxId = profile.box_id
  const like = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`

  const { data: people } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .eq('box_id', boxId)
    .eq('role', 'athlete')
    .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},id_number.ilike.${like}`)
    .limit(20)

  const { data: leads } = await supabase
    .from('leads')
    .select('id, full_name, email, phone, source, status')
    .eq('box_id', boxId)
    .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
    .limit(20)

  const ids = (people ?? []).map((p) => p.id)
  const today = new Date().toISOString().slice(0, 10)
  let byAthlete: Record<string, { payment_status: string; end_date: string | null; last_paid_date: string | null; frozen_from: string | null; frozen_until: string | null }[]> = {}
  if (ids.length) {
    const { data: ms } = await supabase
      .from('memberships')
      .select('athlete_id, payment_status, end_date, last_paid_date, frozen_from, frozen_until')
      .eq('box_id', boxId)
      .in('athlete_id', ids)
    byAthlete = (ms ?? []).reduce((acc, m) => {
      ;(acc[m.athlete_id] ??= []).push(m)
      return acc
    }, {} as typeof byAthlete)
  }

  const members: MemberRow[] = (people ?? []).map((p) => {
    const mem = byAthlete[p.id] ?? []
    const status = mem.length ? getMembershipStatus(mem as never, today) : 'no_membership'
    return { id: p.id, full_name: p.full_name, email: p.email, phone: p.phone, status }
  })
  const leadRows: LeadRow[] = (leads ?? []).map((l) => ({ id: l.id, full_name: l.full_name, email: l.email, phone: l.phone, source: l.source, status: l.status }))

  return { error: null, hits: rankPeopleResults(members, leadRows, q) }
}
