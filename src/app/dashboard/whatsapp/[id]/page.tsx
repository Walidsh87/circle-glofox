import { requireManagerPage } from '@/lib/auth/page-guards'
import { notFound } from 'next/navigation'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { cn } from '@/lib/utils'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

const STATUS_CLASS: Record<string, string> = {
  read: 'text-accent-ink',
  delivered: 'text-ink',
  sent: 'text-ink-3',
  failed: 'text-danger',
  queued: 'text-ink-3',
}

export default async function WaDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { supabase, profile, boxName } = await requireManagerPage()

  const { data: c } = await supabase.from('wa_campaigns').select('id, body_preview, audience_status, audience_tag, sent_count, failed_count, skipped_count, recipient_count').eq('id', id).eq('box_id', profile.box_id).single()
  if (!c) notFound()

  const { data: recipients } = await supabase.from('wa_recipients').select('phone, status, error').eq('campaign_id', id).order('status', { ascending: true })
  const recs = (recipients ?? []) as { phone: string; status: string; error: string | null }[]
  const delivered = recs.filter((r) => r.status === 'delivered').length
  const read = recs.filter((r) => r.status === 'read').length
  const failed = recs.filter((r) => r.status === 'failed').length
  const audience = `${SEGMENT_LABELS[c.audience_status as Segment] ?? c.audience_status}${c.audience_tag ? ` · ${c.audience_tag}` : ''}`

  return (
    <DashboardShell
      active="whatsapp"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="WhatsApp campaign"
    >
      <div className="max-w-[640px]">
        <span className="font-mono text-[12.5px] text-ink-3">
          {audience} · {c.sent_count} sent · {delivered} delivered · {read} read · {failed} failed · {c.skipped_count} skipped
        </span>
        <div className="mb-6 mt-4 whitespace-pre-wrap rounded-xl border border-line bg-surface p-4 text-[13.5px] text-ink">{c.body_preview}</div>
        <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">Recipients</h2>
        <div className="flex flex-col gap-1">
          {recs.map((r, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="flex-1 text-[13px] text-ink">{r.phone || '(no phone)'}</span>
              <span className={cn('text-xs font-semibold', STATUS_CLASS[r.status] ?? 'text-ink-3')}>{r.status}</span>
              {r.error && <span className="text-[11.5px] text-ink-faint">{r.error}</span>}
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  )
}
