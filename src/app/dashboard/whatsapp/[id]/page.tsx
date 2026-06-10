import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

const STATUS_COLOR: Record<string, string> = {
  read: 'var(--circle-lime-ink)',
  delivered: 'var(--c-ink)',
  sent: 'var(--c-ink-muted)',
  failed: 'var(--c-danger)',
  queued: 'var(--c-ink-muted)',
}

export default async function WaDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: c } = await supabase.from('wa_campaigns').select('id, body_preview, audience_status, audience_tag, sent_count, failed_count, skipped_count, recipient_count').eq('id', id).eq('box_id', profile.box_id).single()
  if (!c) notFound()

  const { data: recipients } = await supabase.from('wa_recipients').select('phone, status, error').eq('campaign_id', id).order('status', { ascending: true })
  const recs = (recipients ?? []) as { phone: string; status: string; error: string | null }[]
  const delivered = recs.filter((r) => r.status === 'delivered').length
  const read = recs.filter((r) => r.status === 'read').length
  const failed = recs.filter((r) => r.status === 'failed').length
  const audience = `${SEGMENT_LABELS[c.audience_status as Segment] ?? c.audience_status}${c.audience_tag ? ` · ${c.audience_tag}` : ''}`

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="whatsapp" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>WhatsApp campaign</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
              {audience} · {c.sent_count} sent · {delivered} delivered · {read} read · {failed} failed · {c.skipped_count} skipped
            </span>
            <div style={{ padding: 16, borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', margin: '16px 0 24px', whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'var(--c-ink)' }}>{c.body_preview}</div>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recipients</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recs.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--c-ink)' }}>{r.phone || '(no phone)'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[r.status] ?? 'var(--c-ink-muted)' }}>{r.status}</span>
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
