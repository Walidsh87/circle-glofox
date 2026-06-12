import { requireStaffPage } from '@/lib/auth/page-guards'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { cn } from '@/lib/utils'
import { InboxPoller } from '../_components/inbox-poller'
import { Composer } from '../_components/composer'
import { markRead } from '../_actions/mark-read'
import { withinSessionWindow } from '@/lib/inbox'

export default async function ConversationPage(ctx: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await ctx.params
  const { supabase, profile, boxName } = await requireStaffPage()

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
    <DashboardShell
      active="inbox"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title={memberName}
      actions={
        <Link href={`/dashboard/members/${conv.member_id}`} className="text-[13px] text-ink-3 transition-colors hover:text-ink">
          Open profile →
        </Link>
      }
    >
      <InboxPoller />
      <div className="flex max-w-[600px] flex-col gap-2.5">
        {messages.map((m) => {
          const mine = m.sender_role === 'staff'
          return (
            <div key={m.id} className={cn('max-w-[78%]', mine ? 'self-end' : 'self-start')}>
              <div className={cn(
                'whitespace-pre-wrap rounded-xl px-3 py-2 text-[13.5px]',
                mine ? 'bg-ink text-canvas' : 'border border-line bg-surface text-ink'
              )}>
                {m.body}
              </div>
              <div className={cn('mt-0.5 font-mono text-[10.5px] text-ink-3', mine ? 'text-right' : 'text-left')}>
                {mine ? (nameById.get(m.sender_id) ?? 'Staff') : memberName} · {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{m.channel === 'whatsapp' ? ' · via WhatsApp' : ''}
              </div>
            </div>
          )
        })}
      </div>
      <div className="sticky bottom-0 mt-6 max-w-[600px] rounded-xl border border-line bg-surface p-3 shadow-card">
        <Composer memberId={conv.member_id} waHint={waHint} />
      </div>
    </DashboardShell>
  )
}
