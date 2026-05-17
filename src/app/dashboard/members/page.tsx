import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { AddMemberForm } from './_components/add-member-form'
import { RemoveMemberButton } from './_components/remove-member-button'
import { AddLeadForm } from './_components/add-lead-form'
import { LeadsList, type Lead } from './_components/leads-list'

type Tab = 'members' | 'coaches' | 'leads'

export default async function MembersPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const tab: Tab = (['members', 'coaches', 'leads'].includes(searchParams.tab ?? '')
    ? searchParams.tab
    : 'members') as Tab

  // Counts for all tabs
  const [{ count: memberCount }, { count: coachCount }, { count: leadCount }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id).eq('role', 'athlete'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id).eq('role', 'coach'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id),
  ])

  // Tab-specific data
  const { data: people } = tab !== 'leads'
    ? await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, created_at')
        .eq('box_id', profile.box_id)
        .eq('role', tab === 'coaches' ? 'coach' : 'athlete')
        .order('created_at', { ascending: true })
    : { data: null }

  const { data: leads } = tab === 'leads'
    ? await supabase
        .from('leads')
        .select('id, full_name, phone, email, source, status, notes, drop_in_date, created_at')
        .eq('box_id', profile.box_id)
        .order('created_at', { ascending: false })
    : { data: null }

  const TABS = [
    { key: 'members' as Tab, label: 'Members',  count: memberCount ?? 0 },
    { key: 'coaches' as Tab, label: 'Coaches',  count: coachCount ?? 0 },
    { key: 'leads'   as Tab, label: 'Leads',    count: leadCount ?? 0 },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="members" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            People
          </h1>
        </header>

        {/* Tab bar */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-surface)', padding: '0 28px', flexShrink: 0,
        }}>
          {TABS.map(t => (
            <Link
              key={t.key}
              href={`/dashboard/members?tab=${t.key}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '11px 14px',
                fontSize: 13.5, fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? 'var(--c-ink)' : 'var(--c-ink-muted)',
                textDecoration: 'none',
                borderBottom: tab === t.key ? '2px solid var(--circle-lime)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
              <span className="mono" style={{
                fontSize: 10.5, fontWeight: 700,
                background: tab === t.key ? 'var(--circle-lime-soft)' : 'var(--c-surface-alt)',
                color: tab === t.key ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)',
                padding: '1px 6px', borderRadius: 999,
              }}>{t.count}</span>
            </Link>
          ))}
        </div>

        {/* Content */}
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>

          {/* ── Leads tab ── */}
          {tab === 'leads' && (
            <>
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, padding: '18px 20px', marginBottom: 20,
                boxShadow: 'var(--c-shadow-sm)',
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Add lead</p>
                <AddLeadForm />
              </div>
              <LeadsList leads={(leads ?? []) as Lead[]} />
            </>
          )}

          {/* ── Members / Coaches tab ── */}
          {tab !== 'leads' && (
            <>
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, padding: '18px 20px', marginBottom: 20,
                boxShadow: 'var(--c-shadow-sm)',
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>
                  Add {tab === 'coaches' ? 'coach' : 'member'}
                </p>
                <AddMemberForm defaultRole={tab === 'coaches' ? 'coach' : 'athlete'} />
              </div>

              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)' }}>
                      <Th>Name</Th>
                      <Th>Email</Th>
                      <Th>Phone</Th>
                      <Th>Role</Th>
                      <th style={{ padding: '10px 16px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {people?.map((member) => (
                      <tr key={member.id} style={{ borderBottom: '1px solid var(--c-divider)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                          <Link href={`/dashboard/members/${member.id}`} className="member-link" style={{ color: 'var(--c-ink)', textDecoration: 'none' }}>
                            {member.full_name}
                          </Link>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }}>{member.email}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }}>{member.phone ?? '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
                            background: member.role === 'coach' ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)',
                            color: member.role === 'coach' ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)',
                            textTransform: 'capitalize',
                          }}>{member.role}</span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {member.id !== user.id && (
                            <RemoveMemberButton memberId={member.id} memberName={member.full_name} />
                          )}
                        </td>
                      </tr>
                    ))}
                    {(!people || people.length === 0) && (
                      <tr>
                        <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                          No {tab} yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: '10px 16px', textAlign: 'left',
      fontFamily: 'var(--font-geist-mono)', fontSize: 10.5,
      fontWeight: 500, color: 'var(--c-ink-muted)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{children}</th>
  )
}
