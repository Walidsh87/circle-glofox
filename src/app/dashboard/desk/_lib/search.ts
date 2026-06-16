import type { MembershipStatus } from '@/lib/membership-status'

export type MemberRow = { id: string; full_name: string | null; email: string | null; phone: string | null; status: MembershipStatus | 'no_membership' }
export type LeadRow = { id: string; full_name: string | null; email: string | null; phone: string | null; source: string; status: string }

export type PersonHit =
  | { kind: 'member'; id: string; name: string; email: string | null; phone: string | null; status: MemberRow['status']; score: number }
  | { kind: 'lead'; id: string; name: string; email: string | null; phone: string | null; source: string; leadStatus: string; score: number }

// Higher score = better match. Name prefix > name word-prefix > substring (name/email/phone).
function scoreOne(q: string, name: string | null, email: string | null, phone: string | null): number {
  const n = (name ?? '').toLowerCase()
  const e = (email ?? '').toLowerCase()
  const p = (phone ?? '').replace(/\s/g, '')
  const query = q.toLowerCase().trim()
  const pq = query.replace(/\s/g, '')
  if (!query) return 0
  if (n.startsWith(query)) return 100
  if (n.split(/\s+/).some((w) => w.startsWith(query))) return 80
  if (n.includes(query)) return 60
  if (e.startsWith(query)) return 50
  if (e.includes(query)) return 40
  if (pq && p.includes(pq)) return 30
  return 0
}

/** Merge + rank members and leads for the desk search. Members outrank leads at equal score. */
export function rankPeopleResults(members: MemberRow[], leads: LeadRow[], query: string): PersonHit[] {
  const hits: PersonHit[] = []
  for (const m of members) {
    const score = scoreOne(query, m.full_name, m.email, m.phone)
    if (score > 0) hits.push({ kind: 'member', id: m.id, name: m.full_name ?? '—', email: m.email, phone: m.phone, status: m.status, score })
  }
  for (const l of leads) {
    const score = scoreOne(query, l.full_name, l.email, l.phone)
    if (score > 0) hits.push({ kind: 'lead', id: l.id, name: l.full_name ?? '—', email: l.email, phone: l.phone, source: l.source, leadStatus: l.status, score })
  }
  // Members win ties (kindRank 0 < 1); higher score first.
  return hits.sort((a, b) => b.score - a.score || (a.kind === 'member' ? 0 : 1) - (b.kind === 'member' ? 0 : 1))
}
