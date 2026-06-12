import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { cn } from '@/lib/utils'
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
    <DashboardShell
      active="inbox"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Inbox"
    >
      <InboxPoller />
      <div className="max-w-[560px]">
        <div className="mb-3"><NewMessage members={members} /></div>
        {convs.length === 0 ? (
          <p className="text-sm text-ink-3">No conversations yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {convs.map((c) => (
              <Link key={c.id} href={`/dashboard/inbox/${c.id}`} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 text-ink transition-colors hover:border-line-strong">
                {c.staff_unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-ink" />}
                <div className="min-w-0 flex-1">
                  <div className={cn('text-sm', c.staff_unread ? 'font-bold' : 'font-semibold')}>
                    {nameById.get(c.member_id) ?? 'Member'}
                    {c.last_wa_inbound_at && <span className="ml-1.5 text-[10px] font-bold text-accent-ink">WhatsApp</span>}
                  </div>
                  <div className="truncate text-[12.5px] text-ink-3">{c.last_sender_role === 'staff' ? 'You: ' : ''}{c.last_preview ?? ''}</div>
                </div>
                {c.last_message_at && <span className="font-mono text-[11px] text-ink-3">{new Date(c.last_message_at).toLocaleDateString('en-GB')}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
