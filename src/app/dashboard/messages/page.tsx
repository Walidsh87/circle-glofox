import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { InboxPoller } from '../inbox/_components/inbox-poller'
import { Composer } from '../inbox/_components/composer'
import { markRead } from '../inbox/_actions/mark-read'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''
  const gymName = boxName || 'the gym'

  const { data: conv } = await supabase.from('conversations').select('id').eq('member_id', user.id).maybeSingle()
  let messages: { id: string; sender_role: string; body: string; created_at: string }[] = []
  if (conv) {
    await markRead(conv.id)
    const { data: msgRows } = await supabase.from('messages').select('id, sender_role, body, created_at').eq('conversation_id', conv.id).order('created_at', { ascending: true })
    messages = (msgRows ?? []) as typeof messages
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="messages" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Messages</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <InboxPoller />
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>Send {gymName} a message — coaches usually reply within a day.</p>
            ) : messages.map((m) => {
              const mine = m.sender_role === 'member'
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                  <div style={{ padding: '9px 13px', borderRadius: 12, background: mine ? '#111' : 'var(--c-surface)', color: mine ? '#fff' : 'var(--c-ink)', border: mine ? 'none' : '1px solid var(--c-border)', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>{mine ? 'You' : gymName} · {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--c-border)', padding: '16px 32px', background: 'var(--c-surface)' }}>
          <div style={{ maxWidth: 600 }}><Composer memberId={user.id} /></div>
        </div>
      </div>
    </div>
  )
}
