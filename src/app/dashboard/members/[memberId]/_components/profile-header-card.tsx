import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getServerT } from '@/lib/i18n/server'
import { formatDate } from '../_lib/profile-format'

const ROLE_TONES: Record<string, 'accent' | 'ok' | 'neutral'> = {
  owner: 'accent',
  coach: 'ok',
  athlete: 'neutral',
}

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'danger'> = {
  paid: 'ok',
  unpaid: 'warn',
  overdue: 'danger',
}

type Member = { full_name: string | null; email: string | null; phone: string | null; role: string; created_at: string }
type ActiveMembership = {
  plan_name: string
  is_trial: boolean | null
  end_date: string | null
  monthly_price_aed: number | null
  payment_status: string
  last_paid_date: string | null
}

/** Top member-profile card: name + role + contact, and the active membership summary. */
export async function ProfileHeaderCard({ member, activeMembership }: { member: Member; activeMembership: ActiveMembership | null }) {
  const t = await getServerT()
  return (
    <Card className="mb-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="font-display text-xl font-bold text-ink">{member.full_name}</span>
            <Badge tone={ROLE_TONES[member.role] ?? 'neutral'} className="capitalize">
              {member.role}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-4">
            {member.email && <span className="text-[13.5px] text-ink-2">{member.email}</span>}
            {member.phone && <span className="font-mono text-[13px] text-ink-3">{member.phone}</span>}
            <span className="text-xs text-ink-3">{t('profile.joined', { date: formatDate(member.created_at) })}</span>
          </div>
        </div>

        {activeMembership && (
          <div className="text-end">
            <div className="mb-1 text-[13px] font-semibold text-ink">{activeMembership.plan_name}</div>
            <div className="flex items-center justify-end gap-2">
              {activeMembership.is_trial && (
                <span className="font-mono text-[11px] font-bold text-accent-ink">
                  {t('profile.trial')}{activeMembership.end_date ? ` · ${t('profile.trialEnds', { date: activeMembership.end_date })}` : ''}
                </span>
              )}
              {activeMembership.monthly_price_aed && (
                <span className="font-mono text-[13px] text-ink-3">
                  {t('profile.monthlyPrice', { price: activeMembership.monthly_price_aed })}
                </span>
              )}
              <Badge tone={STATUS_TONES[activeMembership.payment_status] ?? 'warn'} className="capitalize">
                {activeMembership.payment_status}
              </Badge>
            </div>
            {activeMembership.last_paid_date && (
              <div className="mt-1 font-mono text-[11.5px] text-ink-3">
                {t('profile.lastPaid', { date: activeMembership.last_paid_date })}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
