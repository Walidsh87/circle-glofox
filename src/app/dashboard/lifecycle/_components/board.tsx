import Link from 'next/link'
import { STAGES, type Stage } from '@/lib/lifecycle'
import { MarkContacted } from '@/app/dashboard/retention/_components/mark-contacted'
import type { Card } from '../_lib/load-lifecycle'

const STAGE_LABELS: Record<Stage, string> = {
  lead: 'Leads', trial: 'Trial', active: 'Active', at_risk: 'At-risk', frozen: 'Frozen', cancelled: 'Cancelled',
}

export function Board({ columns }: { columns: Record<Stage, Card[]> }) {
  return (
    <div className="flex min-w-min items-start gap-3.5">
      {STAGES.map((stage) => {
        const cards = columns[stage]
        return (
          <div key={stage} className="flex w-[230px] shrink-0 flex-col gap-2">
            <div className="flex items-baseline justify-between px-0.5">
              <span className="text-[13px] font-semibold text-ink">{STAGE_LABELS[stage]}</span>
              <span className="font-mono text-[11px] text-ink-3">{cards.length}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {cards.length === 0 ? (
                <p className="px-0.5 py-2 text-xs text-ink-faint">—</p>
              ) : cards.map((c) => (
                <div
                  key={`${c.kind}-${c.id}`}
                  className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-surface px-3 py-2.5 shadow-card"
                >
                  <Link
                    href={c.href}
                    className="text-[13.5px] font-semibold text-ink transition-colors hover:text-accent-ink"
                  >
                    {c.name}
                  </Link>
                  {c.hint && <span className="font-mono text-[11px] text-ink-3">{c.hint}</span>}
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
