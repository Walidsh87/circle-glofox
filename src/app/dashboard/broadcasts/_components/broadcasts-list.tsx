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
    return <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No broadcasts yet.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((b) => (
        <Link key={b.id} href={`/dashboard/broadcasts/${b.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', textDecoration: 'none', color: 'var(--c-ink)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.subject}</div>
            <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{audienceLabel(b.audience_status, b.audience_tag)} · {new Date(b.created_at).toLocaleDateString('en-GB')}</div>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>
            {b.sent_count} sent{b.failed_count > 0 ? ` · ${b.failed_count} failed` : ''}{b.skipped_count > 0 ? ` · ${b.skipped_count} skipped` : ''}
          </div>
        </Link>
      ))}
    </div>
  )
}
