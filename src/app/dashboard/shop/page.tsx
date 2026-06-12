import { requirePage } from '@/lib/auth/page-guards'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
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
    <DashboardShell
      active="shop"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Buy a pack"
    >
      <div className="max-w-3xl">
        {justPurchased && (
          <div className="mb-5 rounded-xl border border-line bg-ok-soft px-4 py-3 text-[13px] text-ok">
            Payment received — your new credits will appear here shortly.
          </div>
        )}

        {/* Your credits */}
        <Card className="mb-5 p-5">
          <p className="mb-3 text-[13px] font-semibold text-ink">Your credits</p>
          {creditRows.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {creditRows.map((c) => (
                <div key={c.id} className="flex justify-between text-[13px] text-ink-2">
                  <span>
                    {creditPkgName(c)} <span className="font-mono text-ink-3">({c.kind === 'pt_session' ? 'PT' : 'class'})</span>
                  </span>
                  <span className="font-mono">{c.credits_remaining}/{c.credits_total}{c.expires_at ? ` · exp ${c.expires_at}` : ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-3">No credits yet. Buy a pack below.</p>
          )}
        </Card>

        {/* Storefront */}
        <p className="mb-3 text-[13px] font-semibold text-ink">Available packages</p>
        {(!packages || packages.length === 0) ? (
          <p className="text-[13px] text-ink-3">No packages available right now.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {packages.map((p) => (
              <Card key={p.id} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <div className="text-sm font-semibold text-ink">{p.name}</div>
                  <div className="mt-0.5 font-mono text-xs text-ink-3">
                    {TYPE_LABEL[p.type] ?? p.type} · {p.credit_count} {p.type === 'pt_block' ? 'sessions' : 'classes'} · {Number(p.price_aed).toFixed(2)} AED
                  </div>
                </div>
                <BuyButton packageId={p.id} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
