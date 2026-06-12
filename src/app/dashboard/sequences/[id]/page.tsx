import { requireManagerPage } from '@/lib/auth/page-guards'
import { notFound } from 'next/navigation'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { SequenceForm } from '../_components/sequence-form'
import type { SequenceStep } from '@/lib/sequences'
import type { TriggerType } from '@/lib/automations'

export default async function EditSequencePage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { supabase, profile, boxName } = await requireManagerPage()

  const { data: s } = await supabase.from('sequences').select('id, name, trigger_type, trigger_days, steps').eq('id', id).eq('box_id', profile.box_id).single()
  if (!s) notFound()

  return (
    <DashboardShell
      active="sequences"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Edit sequence"
    >
      <SequenceForm initial={{
        id: s.id,
        name: s.name,
        triggerType: s.trigger_type as TriggerType,
        triggerDays: s.trigger_days,
        steps: (s.steps as SequenceStep[] | null) ?? [],
      }} />
    </DashboardShell>
  )
}
