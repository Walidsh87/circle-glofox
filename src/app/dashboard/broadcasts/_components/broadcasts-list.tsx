import Link from 'next/link'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

export type BroadcastRow = {
  id: string
  subject: string
  audience_status: string
  audience_tag: string | null
  created_at: string
  status: string
  recipient_count: number
  sent_count: number
  failed_count: number
  skipped_count: number
}

function audienceLabel(status: string, tag: string | null): string {
  const base = SEGMENT_LABELS[status as Segment] ?? status
  return tag ? `${base} · ${tag}` : base
}

export function BroadcastsList({ rows }: { rows: BroadcastRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-3">No broadcasts yet.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((b) => (
        <Link
          key={b.id}
          href={`/dashboard/broadcasts/${b.id}`}
          className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 text-ink transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{b.subject}</div>
            <div className="text-xs text-ink-3">
              {audienceLabel(b.audience_status, b.audience_tag)} · {new Date(b.created_at).toLocaleDateString('en-GB')}
            </div>
          </div>
          <div className="font-mono text-[11.5px] text-ink-3">
            {b.sent_count} sent{b.failed_count > 0 ? ` · ${b.failed_count} failed` : ''}{b.skipped_count > 0 ? ` · ${b.skipped_count} skipped` : ''}
          </div>
        </Link>
      ))}
    </div>
  )
}
