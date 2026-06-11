import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { InboxPoller } from './_components/inbox-poller'
import { NewMessage, type MemberOption } from './_components/new-message'

export default async function InboxPage() {
  const { supabase, profile, boxName } = await requireStaffPage()

  const { data: convRows } = await supabase.from('conversations').select('id, member_id, last_preview, last_message_at, last_sender_role, staff_unread, last_wa_inbound_at').eq('box_id', profile.box_id).order('last_message_at', { ascending: false, nullsFirst: false })
  const convs = (convRows ?? []) as { id: string; member_id: string; last_preview: string | null; last_message_at: string | null; last_sender_role: string | null; staff_unread: boolean; last_wa_inbound_at: string | null }[]

  const { data: athleteRows } = await supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).eq('role', 'athlete')
  const athletes = (athleteRows ?? []) as { id: string; full_name: string | null }[]
  const nameById = new Map(athletes.map((a) => [a.id, a.full_name ?? 'Member']))
  const withThread = new Set(convs.map((c) => c.member_id))
  const members: MemberOption[] = athletes.filter((a) => !withThread.has(a.id)).map((a) => ({ id: a.id, full_name: a.full_name ?? 'Member' }))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="inbox" userName={profile.full_name!} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Inbox</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <InboxPoller />
          <div style={{ maxWidth: 560 }}>
            <div style={{ marginBottom: 12 }}><NewMessage members={members} /></div>
            {convs.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No conversations yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {convs.map((c) => (
                  <Link key={c.id} href={`/dashboard/inbox/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', textDecoration: 'none', color: 'var(--c-ink)' }}>
                    {c.staff_unread && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--circle-lime-ink)', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: c.staff_unread ? 700 : 600 }}>{nameById.get(c.member_id) ?? 'Member'}{c.last_wa_inbound_at && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>WhatsApp</span>}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_sender_role === 'staff' ? 'You: ' : ''}{c.last_preview ?? ''}</div>
                    </div>
                    {c.last_message_at && <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>{new Date(c.last_message_at).toLocaleDateString('en-GB')}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
