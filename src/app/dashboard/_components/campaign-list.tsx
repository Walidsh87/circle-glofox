import Link from 'next/link'
import { audienceLabel } from '@/lib/broadcast-audience'

/** Normalized row for the shared campaign history list. Each channel's list component maps
 *  its own row (subject / body / body_preview → `title`) onto this shape. */
export type CampaignRow = {
  id: string
  title: string
  audience_status: string
  audience_tag: string | null
  created_at: string
  sent_count: number
  failed_count: number
  skipped_count: number
}

/** Shared campaign history list (email / SMS / WhatsApp): one Link card per campaign with
 *  title, audience + date, and a sent/failed/skipped count summary. */
export function CampaignList({ rows, hrefBase, emptyText }: { rows: CampaignRow[]; hrefBase: string; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-3">{emptyText}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <Link
          key={r.id}
          href={`${hrefBase}/${r.id}`}
          className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 text-ink transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{r.title}</div>
            <div className="text-xs text-ink-3">
              {audienceLabel(r.audience_status, r.audience_tag)} · {new Date(r.created_at).toLocaleDateString('en-GB')}
            </div>
          </div>
          <div className="font-mono text-[11.5px] text-ink-3">
            {r.sent_count} sent{r.failed_count > 0 ? ` · ${r.failed_count} failed` : ''}{r.skipped_count > 0 ? ` · ${r.skipped_count} skipped` : ''}
          </div>
        </Link>
      ))}
    </div>
  )
}
