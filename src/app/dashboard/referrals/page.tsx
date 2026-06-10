import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { RewardButton } from './_components/reward-button'

type ReferralItem = { kind: 'lead' | 'member'; id: string; name: string; rewardedAt: string | null }

export default async function ReferralsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="referrals" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Referrals</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            {groups.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No referrals yet. Members share their link from their profile.</p>
            ) : groups.map((g) => (
              <div key={g.rid} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-ink)', marginBottom: 8 }}>{g.name} <span className="mono" style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--c-ink-muted)' }}>· {g.items.length}</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {g.items.map((it) => (
                    <div key={`${it.kind}-${it.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                      <span style={{ flex: 1, fontSize: 14, color: 'var(--c-ink)' }}>
                        {it.kind === 'member'
                          ? <Link href={`/dashboard/members/${it.id}`} style={{ color: 'var(--c-ink)', textDecoration: 'none' }}>{it.name}</Link>
                          : it.name}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: it.kind === 'member' ? 'var(--circle-lime-soft)' : 'var(--c-surface-alt)', color: it.kind === 'member' ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)' }}>{it.kind === 'member' ? 'Joined' : 'Pending'}</span>
                      {it.kind === 'member' && (it.rewardedAt
                        ? <span style={{ fontSize: 11.5, color: 'var(--circle-lime-ink)' }}>Rewarded ✓</span>
                        : <RewardButton memberId={it.id} />)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
