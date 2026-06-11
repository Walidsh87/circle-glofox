import { requireManagerPage } from '@/lib/auth/page-guards'
import { notFound } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import { renderBlocks, type Block } from '@/lib/email-blocks'
import { RetryButton } from './_components/retry-button'

const STATUS_COLOR: Record<string, string> = {
  sent: 'var(--circle-lime-ink)',
  failed: 'var(--c-danger)',
  skipped: 'var(--c-ink-muted)',
  queued: 'var(--c-ink-muted)',
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="broadcasts" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>{b.subject}</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
                {audience} · {b.sent_count} sent · {b.failed_count} failed · {b.skipped_count} skipped · {pct(openedCount)} opened · {pct(clickedCount)} clicked
              </span>
              {b.failed_count > 0 && <RetryButton broadcastId={b.id} />}
            </div>
            {b.body_blocks
              // eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks
              ? <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid var(--c-border)', marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: renderBlocks(b.body_blocks as Block[], { firstName: 'Alex' }) }} />
              : <div style={{ padding: 16, borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 24, whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'var(--c-ink)' }}>{b.body}</div>}
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recipients</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recs.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--c-ink)' }}>{r.email || '(no email)'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[r.status] ?? 'var(--c-ink-muted)' }}>{r.status}</span>
                  {r.opened_at && <span style={{ fontSize: 11, color: 'var(--circle-lime-ink)' }}>opened</span>}
                  {r.clicked_at && <span style={{ fontSize: 11, color: 'var(--circle-lime-ink)' }}>clicked</span>}
                  {r.error && <span style={{ fontSize: 11.5, color: 'var(--c-ink-faint)' }}>{r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
