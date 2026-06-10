import Link from 'next/link'
import { STAGES, type Stage } from '@/lib/lifecycle'
import { MarkContacted } from '@/app/dashboard/retention/_components/mark-contacted'
import type { Card } from '../_lib/load-lifecycle'

const STAGE_LABELS: Record<Stage, string> = {
  lead: 'Leads', trial: 'Trial', active: 'Active', at_risk: 'At-risk', frozen: 'Frozen', cancelled: 'Cancelled',
}

export function Board({ columns }: { columns: Record<Stage, Card[]> }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 'min-content' }}>
      {STAGES.map((stage) => {
        const cards = columns[stage]
        return (
          <div key={stage} style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>{STAGE_LABELS[stage]}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>{cards.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cards.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--c-ink-faint)', padding: '8px 2px' }}>—</p>
              ) : cards.map((c) => (
                <div key={`${c.kind}-${c.id}`} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: 'var(--c-shadow-sm)' }}>
                  <Link href={c.href} style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)', textDecoration: 'none' }}>{c.name}</Link>
                  {c.hint && <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>{c.hint}</span>}
                  {c.kind === 'member' && <MarkContacted athleteId={c.id} />}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
