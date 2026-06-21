import { requirePage } from '@/lib/auth/page-guards'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { getServerT } from '@/lib/i18n/server'
import { BuyButton } from './_components/buy-button'
import { summarizeTemplateSessions } from '@/lib/program-store'
import { BuyProgramButton } from './_components/buy-program-button'

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
  const t = await getServerT()
  const TYPE_LABEL: Record<string, string> = { class_pack: t('shop.typeClassPack'), drop_in: t('shop.typeDropIn'), pt_block: t('shop.typePtBlock') }

  const [{ data: packages }, { data: credits }, { data: programs }, { data: ownedRows }] = await Promise.all([
    supabase.from('packages').select('id, name, type, credit_count, price_aed').eq('box_id', profile.box_id).eq('active', true).order('price_aed'),
    supabase.from('package_credits').select('id, kind, credits_remaining, credits_total, expires_at, packages(name)').eq('athlete_id', user.id).order('created_at', { ascending: false }),
    supabase.from('member_programs').select('id, title, notes, price_aed').eq('box_id', profile.box_id).eq('is_template', true).eq('published', true).order('price_aed'),
    supabase.from('member_programs').select('source_template_id').eq('athlete_id', user.id).eq('box_id', profile.box_id).eq('is_template', false).eq('active', true).not('source_template_id', 'is', null),
  ])

  const creditRows = (credits ?? []) as CreditRow[]

  const programRows = (programs ?? []) as { id: string; title: string; notes: string | null; price_aed: number | null }[]
  const ownedTemplateIds = new Set(((ownedRows ?? []) as { source_template_id: string | null }[]).map((r) => r.source_template_id).filter(Boolean) as string[])

  // Session/week counts for the published programs (RLS published_read admits this).
  const programIds = programRows.map((p) => p.id)
  const { data: sessionRows } = programIds.length
    ? await supabase.from('program_sessions').select('program_id, week').in('program_id', programIds).eq('box_id', profile.box_id)
    : { data: [] as { program_id: string; week: number | null }[] }
  const summary = summarizeTemplateSessions((sessionRows ?? []) as { program_id: string; week: number | null }[])

  return (
    <DashboardShell
      active="shop"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title={t('shop.title')}
    >
      <div className="max-w-3xl">
        {justPurchased && (
          <div className="mb-5 rounded-xl border border-line bg-ok-soft px-4 py-3 text-[13px] text-ok">
            {t('shop.purchaseSuccess')}
          </div>
        )}

        {/* Your credits */}
        <Card className="mb-5 p-5">
          <p className="mb-3 text-[13px] font-semibold text-ink">{t('shop.yourCredits')}</p>
          {creditRows.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {creditRows.map((c) => (
                <div key={c.id} className="flex justify-between text-[13px] text-ink-2">
                  <span>
                    {creditPkgName(c)} <span className="font-mono text-ink-3">({c.kind === 'pt_session' ? t('shop.pt') : t('shop.class')})</span>
                  </span>
                  <span className="font-mono">{c.credits_remaining}/{c.credits_total}{c.expires_at ? ` · exp ${c.expires_at}` : ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-3">{t('shop.noCredits')}</p>
          )}
        </Card>

        {/* Storefront */}
        <p className="mb-3 text-[13px] font-semibold text-ink">{t('shop.availablePackages')}</p>
        {(!packages || packages.length === 0) ? (
          <p className="text-[13px] text-ink-3">{t('shop.noPackages')}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {packages.map((p) => (
              <Card key={p.id} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <div className="text-sm font-semibold text-ink">{p.name}</div>
                  <div className="mt-0.5 font-mono text-xs text-ink-3">
                    {TYPE_LABEL[p.type] ?? p.type} · {p.credit_count} {p.type === 'pt_block' ? t('shop.sessions') : t('shop.classes')} · {Number(p.price_aed).toFixed(2)} {t('shop.aed')}
                  </div>
                </div>
                <BuyButton packageId={p.id} />
              </Card>
            ))}
          </div>
        )}

        {/* Programs storefront */}
        {programRows.length > 0 && (
          <div className="mt-6">
            <p className="mb-3 text-[13px] font-semibold text-ink">{t('shop.availablePrograms')}</p>
            <div className="flex flex-col gap-2.5">
              {programRows.map((p) => {
                const s = summary.get(p.id)
                const owned = ownedTemplateIds.has(p.id)
                return (
                  <Card key={p.id} className="flex items-center justify-between px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">{p.title}</div>
                      <div className="mt-0.5 font-mono text-xs text-ink-3">
                        {s && s.weeks > 0 ? `${s.weeks} ${t('shop.weeks')} · ` : ''}
                        {p.price_aed != null ? `${Number(p.price_aed).toFixed(2)} ${t('shop.aed')}` : ''}
                      </div>
                    </div>
                    {owned
                      ? <span className="shrink-0 rounded-lg bg-ok-soft px-2.5 py-1 text-[12px] font-semibold text-ok">{t('shop.owned')}</span>
                      : <BuyProgramButton templateId={p.id} />}
                  </Card>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
