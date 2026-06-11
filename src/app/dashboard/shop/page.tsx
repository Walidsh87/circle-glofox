import { requirePage } from '@/lib/auth/page-guards'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { BuyButton } from './_components/buy-button'

const TYPE_LABEL: Record<string, string> = { class_pack: 'Class pack', drop_in: 'Drop-in', pt_block: 'PT block' }

type CreditRow = {
  id: string
  kind: string
  credits_remaining: number
  credits_total: number
  expires_at: string | null
  packages: { name: string } | { name: string }[] | null
}

function creditPkgName(c: CreditRow): string {
  const p = c.packages
  return Array.isArray(p) ? (p[0]?.name ?? 'Package') : (p?.name ?? 'Package')
}

export default async function ShopPage(ctx: { searchParams: Promise<{ purchase?: string }> }) {
  const justPurchased = (await ctx.searchParams).purchase === 'success'
  const { supabase, user, profile, boxName } = await requirePage()
  // Self-serve storefront is for members; staff manage/sell via the member profile.
  if (profile.role !== 'athlete') redirect('/dashboard')

  const [{ data: packages }, { data: credits }] = await Promise.all([
    supabase.from('packages').select('id, name, type, credit_count, price_aed').eq('box_id', profile.box_id).eq('active', true).order('price_aed'),
    supabase.from('package_credits').select('id, kind, credits_remaining, credits_total, expires_at, packages(name)').eq('athlete_id', user.id).order('created_at', { ascending: false }),
  ])

  const creditRows = (credits ?? []) as CreditRow[]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="shop" userName={profile.full_name!} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex',
          alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Buy a pack
          </h1>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px', maxWidth: 760 }}>
          {justPurchased && (
            <div style={{ background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '12px 16px', fontSize: 13, marginBottom: 20 }}>
              Payment received — your new credits will appear here shortly.
            </div>
          )}

          {/* Your credits */}
          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)', marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Your credits</p>
            {creditRows.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {creditRows.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--c-ink-2)' }}>
                    <span>{creditPkgName(c)} <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>({c.kind === 'pt_session' ? 'PT' : 'class'})</span></span>
                    <span className="mono">{c.credits_remaining}/{c.credits_total}{c.expires_at ? ` · exp ${c.expires_at}` : ''}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>No credits yet. Buy a pack below.</p>
            )}
          </div>

          {/* Storefront */}
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Available packages</p>
          {(!packages || packages.length === 0) ? (
            <p style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>No packages available right now.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {packages.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '14px 18px', boxShadow: 'var(--c-shadow-sm)' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{p.name}</div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginTop: 2 }}>
                      {TYPE_LABEL[p.type] ?? p.type} · {p.credit_count} {p.type === 'pt_block' ? 'sessions' : 'classes'} · {Number(p.price_aed).toFixed(2)} AED
                    </div>
                  </div>
                  <BuyButton packageId={p.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
