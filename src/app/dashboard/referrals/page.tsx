import { requireManagerPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Badge } from '@/components/ui/badge'
import { RewardButton } from './_components/reward-button'

type ReferralItem = { kind: 'lead' | 'member'; id: string; name: string; rewardedAt: string | null }

export default async function ReferralsPage() {
  const { supabase, profile, boxName } = await requireManagerPage()

  const [{ data: leadRows }, { data: memberRows }] = await Promise.all([
    supabase.from('leads').select('id, full_name, referred_by').eq('box_id', profile.box_id).not('referred_by', 'is', null),
    supabase.from('profiles').select('id, full_name, referred_by, referral_rewarded_at').eq('box_id', profile.box_id).eq('role', 'athlete').not('referred_by', 'is', null),
  ])
  const leads = (leadRows ?? []) as { id: string; full_name: string | null; referred_by: string }[]
  const members = (memberRows ?? []) as { id: string; full_name: string | null; referred_by: string; referral_rewarded_at: string | null }[]

  const referrerIds = [...new Set([...leads, ...members].map((r) => r.referred_by))]
  const { data: referrers } = referrerIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', referrerIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const referrerName = new Map(((referrers ?? []) as { id: string; full_name: string | null }[]).map((r) => [r.id, r.full_name ?? 'Member']))

  const byReferrer = new Map<string, ReferralItem[]>()
  for (const l of leads) {
    const arr = byReferrer.get(l.referred_by) ?? []
    arr.push({ kind: 'lead', id: l.id, name: l.full_name ?? 'Lead', rewardedAt: null })
    byReferrer.set(l.referred_by, arr)
  }
  for (const m of members) {
    const arr = byReferrer.get(m.referred_by) ?? []
    arr.push({ kind: 'member', id: m.id, name: m.full_name ?? 'Member', rewardedAt: m.referral_rewarded_at })
    byReferrer.set(m.referred_by, arr)
  }
  const groups = [...byReferrer.entries()].map(([rid, items]) => ({ rid, name: referrerName.get(rid) ?? 'Member', items })).sort((a, b) => b.items.length - a.items.length)

  return (
    <DashboardShell
      active="referrals"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Referrals"
    >
      <div className="max-w-[640px]">
        {groups.length === 0 ? (
          <p className="text-sm text-ink-3">No referrals yet. Members share their link from their profile.</p>
        ) : groups.map((g) => (
          <div key={g.rid} className="mb-5">
            <div className="mb-2 text-[13.5px] font-bold text-ink">{g.name} <span className="font-mono text-[11.5px] font-normal text-ink-3">· {g.items.length}</span></div>
            <div className="flex flex-col gap-1.5">
              {g.items.map((it) => (
                <div key={`${it.kind}-${it.id}`} className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3.5 py-2.5">
                  <span className="flex-1 text-sm text-ink">
                    {it.kind === 'member'
                      ? <Link href={`/dashboard/members/${it.id}`} className="text-ink transition-colors hover:text-accent-ink">{it.name}</Link>
                      : it.name}
                  </span>
                  <Badge tone={it.kind === 'member' ? 'accent' : 'neutral'}>{it.kind === 'member' ? 'Joined' : 'Pending'}</Badge>
                  {it.kind === 'member' && (it.rewardedAt
                    ? <span className="text-[11.5px] text-accent-ink">Rewarded ✓</span>
                    : <RewardButton memberId={it.id} />)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  )
}
