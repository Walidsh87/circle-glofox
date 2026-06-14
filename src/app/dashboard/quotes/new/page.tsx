import { requireStaffPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { QuoteBuilder } from './_components/quote-builder'

export default async function NewQuotePage() {
  const { supabase, profile, boxName } = await requireStaffPage()
  const [{ data: packages }, { data: members }, { data: leads }, { data: box }, { data: plans }] = await Promise.all([
    supabase.from('packages').select('id, name, type, price_aed').eq('box_id', profile.box_id).eq('active', true).order('name'),
    supabase.from('profiles').select('id, full_name, email').eq('box_id', profile.box_id).eq('role', 'athlete').order('full_name'),
    supabase.from('leads').select('id, full_name, email').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
    supabase.from('boxes').select('quote_terms_template').eq('id', profile.box_id).single(),
    supabase.from('membership_plans').select('id, name, monthly_price_aed, provider_plan_ref, is_trial')
      .eq('box_id', profile.box_id).eq('active', true).order('name'),
  ])

  const eligiblePlans = (plans ?? [])
    .filter((p) => !p.is_trial && p.provider_plan_ref && Number(p.monthly_price_aed) > 0)
    .map((p) => ({ id: p.id as string, name: p.name as string, monthly_price_aed: Number(p.monthly_price_aed) }))

  return (
    <DashboardShell active="quotes" userName={profile.full_name!} userRole={profile.role} boxName={boxName} title="New quote">
      <Card className="max-w-3xl p-5">
        <QuoteBuilder
          packages={(packages ?? []).map((p) => ({ ...p, price_aed: Number(p.price_aed) }))}
          members={members ?? []}
          leads={leads ?? []}
          plans={eligiblePlans}
          defaultTerms={(box?.quote_terms_template as string | null) ?? ''}
        />
      </Card>
    </DashboardShell>
  )
}
