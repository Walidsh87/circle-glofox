import { notFound } from 'next/navigation'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { requireProgrammingPage } from '@/lib/auth/page-guards'
import { loadProgramForEdit } from '@/app/dashboard/program/_lib/load-program'
import { ProgramBuilder } from '../_components/program-builder'

export default async function ProgramBuilderPage(ctx: { params: Promise<{ memberId: string }>; searchParams: Promise<{ program?: string }> }) {
  const { memberId } = await ctx.params
  const sp = await ctx.searchParams
  const { supabase, profile, boxName } = await requireProgrammingPage()

  const { data: member } = await supabase.from('profiles').select('full_name, box_id').eq('id', memberId).maybeSingle()
  if (!member || (member as { box_id: string }).box_id !== profile.box_id) notFound()

  // ?program=new → blank builder; a real id → that program; absent → most-recent (back-compat).
  const initial = sp.program === 'new' ? null : await loadProgramForEdit(supabase, memberId, profile.box_id, sp.program)

  return (
    <DashboardShell active="members" userName={profile.full_name} userRole={profile.role} boxName={boxName} title={`Program · ${(member as { full_name: string | null }).full_name ?? 'Member'}`}>
      <ProgramBuilder athleteId={memberId} initial={initial} />
    </DashboardShell>
  )
}
