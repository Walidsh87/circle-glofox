import type { SupabaseClient } from '@supabase/supabase-js'
import { loadGroupedMemberships, buildCandidateBase } from '@/lib/broadcast-candidates'
import type { Candidate } from '@/lib/broadcast-audience'

export async function loadCandidates(
  service: SupabaseClient,
  boxId: string,
  today: string
): Promise<Candidate[]> {
  const [{ data: members }, { mByAthlete, tagsByAthlete }] = await Promise.all([
    service.from('profiles').select('id, full_name, email, marketing_opt_out').eq('box_id', boxId).eq('role', 'athlete'),
    loadGroupedMemberships(service, boxId),
  ])

  return ((members ?? []) as { id: string; full_name: string | null; email: string | null; marketing_opt_out: boolean | null }[])
    .map((m) => buildCandidateBase(m, mByAthlete, tagsByAthlete, today))
}
