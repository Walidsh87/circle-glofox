import { notFound } from 'next/navigation'
import { requireProgrammingPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { TemplateBuilder } from '../_components/template-builder'
import { PublishControl } from '../_components/publish-control'
import Link from 'next/link'
import type { EditableProgram } from '@/app/dashboard/program/_lib/load-program'
import type { ProgramSession, ProgramExercise } from '@/lib/program'

export default async function EditTemplatePage(ctx: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await ctx.params
  const { supabase, profile, boxName } = await requireProgrammingPage()
  const boxId = profile.box_id

  // Load the template header
  const { data: tpl } = await supabase
    .from('member_programs')
    .select('id, title, notes, published, price_aed')
    .eq('id', templateId)
    .eq('box_id', boxId)
    .eq('is_template', true)
    .maybeSingle()

  if (!tpl) notFound()

  const tplRow = tpl as {
    id: string
    title: string
    notes: string | null
    published: boolean
    price_aed: number | null
  }

  // Load sessions
  const { data: sessionRows } = await supabase
    .from('program_sessions')
    .select('id, client_uid, title, week')
    .eq('program_id', templateId)
    .eq('box_id', boxId)
    .order('position')

  const sessions = (sessionRows ?? []) as {
    id: string
    client_uid: string
    title: string
    week: number | null
  }[]

  const sessionIds = sessions.map((s) => s.id)

  // Load exercises
  const { data: exerciseRows } = sessionIds.length
    ? await supabase
        .from('program_exercises')
        .select('session_id, client_uid, name, lift_name, sets, reps, percentage, target_note, rest_seconds')
        .in('session_id', sessionIds)
        .eq('box_id', boxId)
        .order('position')
    : { data: [] as {
        session_id: string
        client_uid: string
        name: string
        lift_name: string | null
        sets: number | null
        reps: string | null
        percentage: number | null
        target_note: string | null
        rest_seconds: number | null
      }[] }

  const exercises = (exerciseRows ?? []) as {
    session_id: string
    client_uid: string
    name: string
    lift_name: string | null
    sets: number | null
    reps: string | null
    percentage: number | null
    target_note: string | null
    rest_seconds: number | null
  }[]

  const initial: EditableProgram = {
    id: tplRow.id,
    title: tplRow.title,
    notes: tplRow.notes,
    active: true,
    sessions: sessions.map((s) => ({
      client_uid: s.client_uid,
      title: s.title,
      week: s.week,
      exercises: exercises
        .filter((e) => e.session_id === s.id)
        .map((e): ProgramExercise => ({
          client_uid: e.client_uid,
          name: e.name,
          lift_name: e.lift_name,
          sets: e.sets,
          reps: e.reps ?? '',
          percentage: e.percentage,
          target_note: e.target_note,
          rest_seconds: e.rest_seconds,
        })),
    })) as ProgramSession[],
  }

  return (
    <DashboardShell
      active="program-store"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title={
        <span className="flex items-center gap-3">
          <Link
            href="/dashboard/program-store"
            className="font-sans text-[13px] font-normal tracking-normal text-ink-3 transition-colors hover:text-ink"
          >
            ← Program Store
          </Link>
          <span className="text-base font-normal text-line-strong">/</span>
          <span className="truncate">{tplRow.title}</span>
        </span>
      }
    >
      <div className="p-5 md:p-8">
        <TemplateBuilder templateId={templateId} initial={initial} />
        {profile.role === 'owner' && (
          <PublishControl
            templateId={templateId}
            published={tplRow.published}
            priceAed={tplRow.price_aed}
          />
        )}
      </div>
    </DashboardShell>
  )
}
