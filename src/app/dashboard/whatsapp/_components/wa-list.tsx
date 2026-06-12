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
    return <p className="text-sm text-ink-3">No WhatsApp campaigns yet.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((s) => (
        <Link key={s.id} href={`/dashboard/whatsapp/${s.id}`} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 text-ink transition-colors hover:border-line-strong">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{s.body_preview}</div>
            <div className="text-xs text-ink-3">{audienceLabel(s.audience_status, s.audience_tag)} · {new Date(s.created_at).toLocaleDateString('en-GB')}</div>
          </div>
          <div className="font-mono text-[11.5px] text-ink-3">
            {s.sent_count} sent{s.failed_count > 0 ? ` · ${s.failed_count} failed` : ''}{s.skipped_count > 0 ? ` · ${s.skipped_count} skipped` : ''}
          </div>
        </Link>
      ))}
    </div>
  )
}
