import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { AddPackageForm } from './_components/add-package-form'
import { PackageActions } from './_components/package-actions'

const TYPE_LABEL: Record<string, string> = {
  class_pack: 'Class pack',
  drop_in: 'Drop-in',
  pt_block: 'PT block',
}

export default async function PackagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (!['owner', 'coach'].includes(profile.role)) redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: packages } = await supabase
    .from('packages')
    .select('id, name, type, credit_count, price_aed, expiry_days, active')
    .eq('box_id', profile.box_id)
    .order('active', { ascending: false })
    .order('name')

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="packages" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex',
          alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>
            Packages
          </h1>
          <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>
            {packages?.length ?? 0} packages
          </span>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)', marginBottom: 20, maxWidth: 620 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Add a package</p>
            <AddPackageForm />
          </div>

          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)' }}>
                  <Th>Package</Th><Th>Type</Th><Th>Credits</Th><Th>Price</Th><Th>Expiry</Th><Th>Status</Th>
                  <th style={{ padding: '10px 16px' }} />
                </tr>
              </thead>
              <tbody>
                {packages?.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--c-divider)', opacity: p.active ? 1 : 0.5 }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--c-ink)' }}>{p.name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }}>{TYPE_LABEL[p.type] ?? p.type}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }} className="mono">{p.credit_count}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }} className="mono">{Number(p.price_aed).toFixed(2)} AED</td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }} className="mono">{p.expiry_days ? `${p.expiry_days}d` : '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999,
                        fontSize: 11.5, fontWeight: 500,
                        background: p.active ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)',
                        color: p.active ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)',
                      }}>{p.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <PackageActions packageId={p.id} active={p.active} />
                    </td>
                  </tr>
                ))}
                {(!packages || packages.length === 0) && (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                      No packages yet. Add one above.
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
      padding: '10px 16px', textAlign: 'left', fontFamily: 'var(--font-geist-mono)',
      fontSize: 10.5, fontWeight: 500, color: 'var(--c-ink-muted)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{children}</th>
  )
}
