import { SOURCE_LABELS, sourceKey } from '@/lib/attribution'

// Lead statuses come from the leads UI (src/app/dashboard/members/_components/leads-list.tsx):
//   'new' | 'contacted' | 'scheduled' | 'converted' | 'lost'
// 'new' is the initial stage — add-lead inserts without a status and the UI falls back to 'new'.
// Funnel stages:
//   total     — every lead created on/after rangeStartIso
//   engaged   — reached any non-initial status (contacted / scheduled / converted / lost)
//   converted — status === 'converted' (set via the status pill in the leads UI; the
//               "→ Member" convert-lead action deletes the lead row entirely, so leads
//               promoted that way leave the table and are not counted here)

export type LeadFunnelLead = { source: string | null; status: string | null; created_at: string }
export type LeadFunnelRow = { source: string; label: string; total: number; engaged: number; converted: number; conversionPct: number }
export type LeadFunnelResult = { rows: LeadFunnelRow[]; totals: Omit<LeadFunnelRow, 'source' | 'label'> }

const INITIAL_STATUS = 'new'
const CONVERTED_STATUS = 'converted'

function pct(converted: number, total: number): number {
  return total === 0 ? 0 : Math.round((converted / total) * 100)
}

export function buildLeadFunnel(leads: LeadFunnelLead[], rangeStartIso: string): LeadFunnelResult {
  const rangeStart = new Date(rangeStartIso).getTime()
  const acc = new Map<string, { total: number; engaged: number; converted: number }>()

  for (const l of leads) {
    if (new Date(l.created_at).getTime() < rangeStart) continue
    const key = sourceKey(l.source)
    let b = acc.get(key)
    if (!b) { b = { total: 0, engaged: 0, converted: 0 }; acc.set(key, b) }
    const status = (l.status ?? '').trim() || INITIAL_STATUS
    b.total++
    if (status !== INITIAL_STATUS) b.engaged++
    if (status === CONVERTED_STATUS) b.converted++
  }

  const rows: LeadFunnelRow[] = [...acc.entries()]
    .map(([source, b]) => ({ source, label: SOURCE_LABELS[source] ?? 'Other', total: b.total, engaged: b.engaged, converted: b.converted, conversionPct: pct(b.converted, b.total) }))
    .sort((a, b) => b.total - a.total)

  const totals = rows.reduce(
    (t, r) => ({ total: t.total + r.total, engaged: t.engaged + r.engaged, converted: t.converted + r.converted, conversionPct: 0 }),
    { total: 0, engaged: 0, converted: 0, conversionPct: 0 },
  )
  totals.conversionPct = pct(totals.converted, totals.total)

  return { rows, totals }
}
