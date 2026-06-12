import { requireManagerPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SequencesList, type SequenceRow } from './_components/sequences-list'

export default async function SequencesPage() {
  const { supabase, profile, boxName } = await requireManagerPage()

  const { data: seqs } = await supabase.from('sequences').select('id, name, trigger_type, trigger_days, steps, enabled').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const { data: enrollments } = await supabase.from('sequence_enrollments').select('sequence_id, status').eq('box_id', profile.box_id)
  const { data: sendRows } = await supabase.from('sequence_sends').select('sequence_enrollments(sequence_id)').eq('box_id', profile.box_id)

  const activeBySeq = new Map<string, number>()
  for (const e of (enrollments ?? []) as { sequence_id: string; status: string }[]) {
    if (e.status === 'active') activeBySeq.set(e.sequence_id, (activeBySeq.get(e.sequence_id) ?? 0) + 1)
  }
  // per-sequence sent count via the sends → enrollment FK embedding.
  const sentBySeq = new Map<string, number>()
  for (const r of (sendRows ?? []) as { sequence_enrollments: { sequence_id: string } | { sequence_id: string }[] | null }[]) {
    const se = Array.isArray(r.sequence_enrollments) ? r.sequence_enrollments[0] : r.sequence_enrollments
    if (se?.sequence_id) sentBySeq.set(se.sequence_id, (sentBySeq.get(se.sequence_id) ?? 0) + 1)
  }

  const rows = ((seqs ?? []) as { id: string; name: string; trigger_type: SequenceRow['trigger_type']; trigger_days: number | null; steps: unknown[]; enabled: boolean }[]).map((s) => ({
    id: s.id, name: s.name, trigger_type: s.trigger_type, trigger_days: s.trigger_days, enabled: s.enabled,
    step_count: Array.isArray(s.steps) ? s.steps.length : 0,
    active_count: activeBySeq.get(s.id) ?? 0,
    sent_count: sentBySeq.get(s.id) ?? 0,
  }))

  return (
    <DashboardShell
      active="sequences"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Sequences"
      actions={
        <Link href="/dashboard/sequences/new" className={cn(buttonVariants({ size: 'sm' }))}>
          New sequence
        </Link>
      }
    >
      <div className="max-w-2xl">
        <SequencesList rows={rows} />
      </div>
    </DashboardShell>
  )
}
