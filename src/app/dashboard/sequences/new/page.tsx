import { requireManagerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { SequenceForm } from '../_components/sequence-form'

export default async function NewSequencePage() {
  const { profile, boxName } = await requireManagerPage()

  return (
    <DashboardShell
      active="sequences"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="New sequence"
    >
      <SequenceForm initial={{ id: null, name: '', triggerType: 'joined', triggerDays: 0, steps: [] }} />
    </DashboardShell>
  )
}
