import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getServerT } from '@/lib/i18n/server'
import { formatDate } from '../_lib/profile-format'
import type { MembershipStatus } from '@/lib/membership-status'

const ROLE_TONES: Record<string, 'accent' | 'ok' | 'neutral'> = {
  owner: 'accent',
  coach: 'ok',
  athlete: 'neutral',
}

const STATUS_PILL: Record<MembershipStatus | 'overdue', { label: string; cls: string }> = {
  paid: { label: 'Active', cls: 'bg-ok-soft text-ok' },
  unpaid: { label: 'Unpaid', cls: 'bg-warn-soft text-warn' },
  // `getMembershipStatus` collapses overdue→unpaid; surface the dunning distinction here.
  overdue: { label: 'Overdue', cls: 'bg-danger-soft text-danger' },
  frozen: { label: 'Frozen', cls: 'border border-line bg-surface-2 text-ink-3' },
  no_membership: { label: 'No plan', cls: 'border border-line bg-surface-2 text-ink-3' },
}

function initials(name: string | null) {
  return (
    (name ?? '')
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

type Member = { full_name: string | null; email: string | null; phone: string | null; role: string; created_at: string }
type ActiveMembership = { plan_name: string; monthly_price_aed: number | null; is_trial: boolean | null; end_date: string | null; payment_status: string; last_paid_date: string | null }

/** Top member-profile card: avatar + identity + membership summary, and (for athletes) glance stats. */
export async function ProfileHeaderCard({
  member,
  activeMembership,
  status,
  tags,
  streak,
  checkins,
  lastVisitLabel,
  badge,
  nextMilestone,
}: {
  member: Member
  activeMembership: ActiveMembership | null
  status: MembershipStatus | null
  tags: string[]
  streak: number
  checkins: number
  lastVisitLabel: string
  badge: number | null
  nextMilestone: { remaining: number; threshold: number } | null
}) {
  const t = await getServerT()
  const effectiveStatus = status === 'unpaid' && activeMembership?.payment_status === 'overdue' ? 'overdue' : status
  const pill = effectiveStatus ? STATUS_PILL[effectiveStatus] : null
  const meta = [
    activeMembership?.plan_name,
    activeMembership?.monthly_price_aed ? t('profile.monthlyPrice', { price: activeMembership.monthly_price_aed }) : null,
    t('profile.joined', { date: formatDate(member.created_at) }),
    activeMembership?.last_paid_date ? t('profile.lastPaid', { date: activeMembership.last_paid_date }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card className="flex flex-wrap items-center gap-4 p-5">
      <div className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-accent text-[15px] font-bold text-accent-contrast">
        {initials(member.full_name)}
      </div>

      <div className="min-w-[200px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">{member.full_name}</span>
          {pill && (
            <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', pill.cls)}>{pill.label}</span>
          )}
          {activeMembership?.is_trial && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-semibold text-accent-ink">
              {t('profile.trial')}{activeMembership.end_date ? ` · ${t('profile.trialEnds', { date: activeMembership.end_date })}` : ''}
            </span>
          )}
          <Badge tone={ROLE_TONES[member.role] ?? 'neutral'} className="capitalize">
            {member.role}
          </Badge>
          {tags.map((tag) => (
            <Badge key={tag} tone="accent" className="font-mono text-[9.5px] font-bold">
              {tag}
            </Badge>
          ))}
        </div>
        <div className="mt-1 text-[12.5px] text-ink-3">{meta}</div>
        {(member.email || member.phone) && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
            {member.email && <span className="text-ink-2">{member.email}</span>}
            {member.phone && <span className="font-mono">{member.phone}</span>}
          </div>
        )}
      </div>

      {(member.role === 'athlete' || checkins > 0) && (
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex gap-6">
            <Stat value={streak > 0 ? `🔥 ${streak}` : '—'} label={t('profile.consistency.weekStreak')} />
            <Stat value={String(checkins)} label={t('profile.consistency.checkIns')} />
            <Stat value={lastVisitLabel} label={t('profile.consistency.lastVisit')} />
          </div>
          {(badge !== null || nextMilestone) && (
            <div className="text-end text-[11px] text-ink-3">
              {badge !== null && t('profile.consistency.club', { badge })}
              {badge !== null && nextMilestone ? ' · ' : ''}
              {nextMilestone && t('profile.consistency.nextMilestone', { remaining: nextMilestone.remaining, threshold: nextMilestone.threshold })}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-end">
      <div className="font-mono text-[17px] font-bold text-ink">{value}</div>
      <div className="text-[10.5px] text-ink-3">{label}</div>
    </div>
  )
}
