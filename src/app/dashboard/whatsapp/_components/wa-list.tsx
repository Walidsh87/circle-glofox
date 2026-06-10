import Link from 'next/link'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

export type WaRow = {
  id: string
  body_preview: string
  audience_status: string
  audience_tag: string | null
  created_at: string
  sent_count: number
  failed_count: number
  skipped_count: number
}

function audienceLabel(status: string, tag: string | null): string {
  const base = SEGMENT_LABELS[status as Segment] ?? status
  return tag ? `${base} · ${tag}` : base
}

export function WaList({ rows }: { rows: WaRow[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No WhatsApp campaigns yet.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((s) => (
        <Link key={s.id} href={`/dashboard/whatsapp/${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', textDecoration: 'none', color: 'var(--c-ink)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.body_preview}</div>
            <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{audienceLabel(s.audience_status, s.audience_tag)} · {new Date(s.created_at).toLocaleDateString('en-GB')}</div>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>
            {s.sent_count} sent{s.failed_count > 0 ? ` · ${s.failed_count} failed` : ''}{s.skipped_count > 0 ? ` · ${s.skipped_count} skipped` : ''}
          </div>
        </Link>
      ))}
    </div>
  )
}
