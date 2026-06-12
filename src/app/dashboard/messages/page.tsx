import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { cn } from '@/lib/utils'
import { InboxPoller } from '../inbox/_components/inbox-poller'
import { Composer } from '../inbox/_components/composer'
import { markRead } from '../inbox/_actions/mark-read'

export default async function MessagesPage() {
  const { supabase, user, profile, boxName } = await requirePage()
  const gymName = boxName || 'the gym'

  const { data: conv } = await supabase.from('conversations').select('id').eq('member_id', user.id).maybeSingle()
  let messages: { id: string; sender_role: string; body: string; created_at: string }[] = []
  if (conv) {
    await markRead(conv.id)
    const { data: msgRows } = await supabase.from('messages').select('id, sender_role, body, created_at').eq('conversation_id', conv.id).order('created_at', { ascending: true })
    messages = (msgRows ?? []) as typeof messages
  }

  return (
    <DashboardShell
      active="messages"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Messages"
    >
      <InboxPoller />
      <div className="flex max-w-[600px] flex-col gap-2.5">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-3">Send {gymName} a message — coaches usually reply within a day.</p>
        ) : messages.map((m) => {
          const mine = m.sender_role === 'member'
          return (
            <div key={m.id} className={cn('max-w-[78%]', mine ? 'self-end' : 'self-start')}>
              <div className={cn(
                'whitespace-pre-wrap rounded-xl px-3 py-2 text-[13.5px]',
                mine ? 'bg-ink text-canvas' : 'border border-line bg-surface text-ink'
              )}>
                {m.body}
              </div>
              <div className={cn('mt-0.5 font-mono text-[10.5px] text-ink-3', mine ? 'text-right' : 'text-left')}>
                {mine ? 'You' : gymName} · {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="sticky bottom-0 mt-6 max-w-[600px] rounded-xl border border-line bg-surface p-3 shadow-card">
        <Composer memberId={user.id} />
      </div>
    </DashboardShell>
  )
}
