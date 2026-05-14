import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { AddMemberForm } from './_components/add-member-form'
import { RemoveMemberButton } from './_components/remove-member-button'

export default async function MembersPage() {
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

  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, created_at')
    .eq('box_id', profile.box_id)
    .order('created_at', { ascending: true })

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="members" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0, gap: 12,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>
            Member directory
          </h1>
          <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>
            {members?.length ?? 0} members
          </span>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          {/* Add member form */}
          <div style={{
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 14, padding: '18px 20px', marginBottom: 20,
            boxShadow: 'var(--c-shadow-sm)',
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Add member</p>
            <AddMemberForm />
          </div>

          {/* Members table */}
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
                {members?.map((member) => (
                  <tr key={member.id} style={{ borderBottom: '1px solid var(--c-divider)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--c-ink)' }}>{member.full_name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }}>{member.email}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }}>{member.phone ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '2px 8px', borderRadius: 999,
                        fontSize: 11.5, fontWeight: 500,
                        background: member.role === 'owner' ? 'var(--circle-lime-soft)' : member.role === 'coach' ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)',
                        color: member.role === 'owner' ? 'var(--circle-lime-ink)' : member.role === 'coach' ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)',
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
                {(!members || members.length === 0) && (
                  <tr>
                    <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                      No members yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
