import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { InboxPoller } from '../_components/inbox-poller'
import { Composer } from '../_components/composer'
import { markRead } from '../_actions/mark-read'
import { withinSessionWindow } from '@/lib/inbox'

export default async function ConversationPage(ctx: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner' && profile.role !== 'coach') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: conv } = await supabase.from('conversations').select('id, member_id, last_wa_inbound_at').eq('id', conversationId).eq('box_id', profile.box_id).single()
  if (!conv) notFound()

  await markRead(conversationId)

  const waActive = !!conv.last_wa_inbound_at
  const waOpen = withinSessionWindow((conv.last_wa_inbound_at as string | null) ?? null, new Date().toISOString())
  const waHint = !waActive ? undefined
    : waOpen ? 'Reply goes to WhatsApp.'
    : '24h WhatsApp window closed — reply will be in-app only; use a WhatsApp campaign to reach them.'

  const { data: msgRows } = await supabase.from('messages').select('id, sender_id, sender_role, body, created_at, channel').eq('conversation_id', conversationId).order('created_at', { ascending: true })
  const messages = (msgRows ?? []) as { id: string; sender_id: string; sender_role: string; body: string; created_at: string; channel: string }[]

  const ids = [...new Set([conv.member_id, ...messages.map((m) => m.sender_id)])]
  const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids)
  const nameById = new Map(((people ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? 'Member']))
  const memberName = nameById.get(conv.member_id) ?? 'Member'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="inbox" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>{memberName}</h1>
          <Link href={`/dashboard/members/${conv.member_id}`} style={{ fontSize: 13, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>Open profile →</Link>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <InboxPoller />
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m) => {
              const mine = m.sender_role === 'staff'
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                  <div style={{ padding: '9px 13px', borderRadius: 12, background: mine ? '#111' : 'var(--c-surface)', color: mine ? '#fff' : 'var(--c-ink)', border: mine ? 'none' : '1px solid var(--c-border)', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>{mine ? (nameById.get(m.sender_id) ?? 'Staff') : memberName} · {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{m.channel === 'whatsapp' ? ' · via WhatsApp' : ''}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--c-border)', padding: '16px 32px', background: 'var(--c-surface)' }}>
          <div style={{ maxWidth: 600 }}><Composer memberId={conv.member_id} waHint={waHint} /></div>
        </div>
      </div>
    </div>
  )
}
