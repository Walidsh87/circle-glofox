export const SOURCE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  walk_in: 'Walk-in',
  referral: 'Referral',
  widget: 'Website widget',
  other: 'Other',
}

export function sourceKey(raw: string | null): string {
  const s = (raw ?? '').trim()
  if (!s) return 'other'
  return s in SOURCE_LABELS ? s : 'other'  // unrecognized sources collapse into Other
}

export type AttributionRow = { source: string; label: string; leads: number; members: number; conversionPct: number; paying: number; mrr: number }
export type AttributionResult = { rows: AttributionRow[]; totals: Omit<AttributionRow, 'source' | 'label'> }

type BuildInput = {
  leads: { source: string | null }[]
  members: { athlete_id: string; source: string | null }[]
  paidByAthlete: Map<string, number>
}

function pct(members: number, leads: number): number {
  const denom = members + leads
  return denom === 0 ? 0 : Math.round((members / denom) * 100)
}

export function buildAttribution(input: BuildInput): AttributionResult {
  const acc = new Map<string, { leads: number; members: number; paying: number; mrr: number }>()
  const get = (key: string) => {
    let b = acc.get(key)
    if (!b) { b = { leads: 0, members: 0, paying: 0, mrr: 0 }; acc.set(key, b) }
    return b
  }

  for (const l of input.leads) get(sourceKey(l.source)).leads++
  for (const m of input.members) {
    const b = get(sourceKey(m.source))
    b.members++
    const mrr = input.paidByAthlete.get(m.athlete_id)
    if (mrr !== undefined) { b.paying++; b.mrr += mrr }
  }

  const rows: AttributionRow[] = [...acc.entries()]
    .filter(([, b]) => b.leads > 0 || b.members > 0)
    .map(([source, b]) => ({ source, label: SOURCE_LABELS[source] ?? 'Other', leads: b.leads, members: b.members, conversionPct: pct(b.members, b.leads), paying: b.paying, mrr: b.mrr }))
    .sort((a, b) => b.members - a.members || b.leads - a.leads)

  const totals = rows.reduce(
    (t, r) => ({ leads: t.leads + r.leads, members: t.members + r.members, paying: t.paying + r.paying, mrr: t.mrr + r.mrr, conversionPct: 0 }),
    { leads: 0, members: 0, paying: 0, mrr: 0, conversionPct: 0 },
  )
  totals.conversionPct = pct(totals.members, totals.leads)

  return { rows, totals }
}
