import { requireManagerPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AutomationsList, type AutomationRow } from './_components/automations-list'

export default async function AutomationsPage() {
  const { supabase, profile, boxName } = await requireManagerPage()

  const { data: autos } = await supabase.from('automations').select('id, name, trigger_type, trigger_days, enabled, channel').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const { data: runs } = await supabase.from('automation_runs').select('automation_id').eq('box_id', profile.box_id)
  const counts = new Map<string, number>()
  for (const r of (runs ?? []) as { automation_id: string }[]) counts.set(r.automation_id, (counts.get(r.automation_id) ?? 0) + 1)
  const rows = ((autos ?? []) as Omit<AutomationRow, 'sent_count'>[]).map((a) => ({ ...a, sent_count: counts.get(a.id) ?? 0 }))

  return (
    <DashboardShell
      active="automations"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Automations"
      actions={
        <Link href="/dashboard/automations/new" className={cn(buttonVariants({ size: 'sm' }))}>
          New automation
        </Link>
      }
    >
      <div className="max-w-2xl">
        <AutomationsList rows={rows} />
      </div>
    </DashboardShell>
  )
}
