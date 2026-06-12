import { requireManagerPage } from '@/lib/auth/page-guards'
import { notFound } from 'next/navigation'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { cn } from '@/lib/utils'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import { renderBlocks, type Block } from '@/lib/email-blocks'
import { RetryButton } from './_components/retry-button'

const STATUS_CLASS: Record<string, string> = {
  sent: 'text-accent-ink',
  failed: 'text-danger',
  skipped: 'text-ink-3',
  queued: 'text-ink-3',
}

export default async function BroadcastDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { supabase, profile, boxName } = await requireManagerPage()

  const { data: b } = await supabase.from('broadcasts').select('id, subject, body, body_blocks, audience_status, audience_tag, created_at, status, recipient_count, sent_count, failed_count, skipped_count').eq('id', id).eq('box_id', profile.box_id).single()
  if (!b) notFound()

  const { data: recipients } = await supabase.from('broadcast_recipients').select('email, status, error, opened_at, clicked_at').eq('broadcast_id', id).order('status', { ascending: true })
  const recs = (recipients ?? []) as { email: string; status: string; error: string | null; opened_at: string | null; clicked_at: string | null }[]
  const audience = `${SEGMENT_LABELS[b.audience_status as Segment] ?? b.audience_status}${b.audience_tag ? ` · ${b.audience_tag}` : ''}`
  const openedCount = recs.filter((r) => r.opened_at).length
  const clickedCount = recs.filter((r) => r.clicked_at).length
  const pct = (n: number) => (b.sent_count > 0 ? `${Math.round((n / b.sent_count) * 100)}%` : '—')

  return (
    <DashboardShell
      active="broadcasts"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title={b.subject}
    >
      <div className="max-w-2xl">
        <div className="mb-5 flex items-center gap-4">
          <span className="font-mono text-xs text-ink-3">
            {audience} · {b.sent_count} sent · {b.failed_count} failed · {b.skipped_count} skipped · {pct(openedCount)} opened · {pct(clickedCount)} clicked
          </span>
          {b.failed_count > 0 && <RetryButton broadcastId={b.id} />}
        </div>
        {b.body_blocks
          // eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks
          ? <div className="mb-6 rounded-xl border border-line bg-white p-4" dangerouslySetInnerHTML={{ __html: renderBlocks(b.body_blocks as Block[], { firstName: 'Alex' }) }} />
          : <div className="mb-6 whitespace-pre-wrap rounded-xl border border-line bg-surface p-4 text-[13.5px] text-ink">{b.body}</div>}
        <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">Recipients</h2>
        <div className="flex flex-col gap-1">
          {recs.map((r, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="flex-1 text-[13px] text-ink">{r.email || '(no email)'}</span>
              <span className={cn('text-xs font-semibold', STATUS_CLASS[r.status] ?? 'text-ink-3')}>{r.status}</span>
              {r.opened_at && <span className="text-[11px] text-accent-ink">opened</span>}
              {r.clicked_at && <span className="text-[11px] text-accent-ink">clicked</span>}
              {r.error && <span className="text-[11.5px] text-ink-faint">{r.error}</span>}
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  )
}
