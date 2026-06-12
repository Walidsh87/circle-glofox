import { requireStaffPage } from '@/lib/auth/page-guards'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { WodForm } from '@/app/dashboard/wod/_components/wod-form'
import { LoadFromLibrary } from '../../_components/load-from-library'
import { DayActions } from '../../_components/day-actions'
import type { StrengthSet, ScalingTier } from '@/app/dashboard/wod/_lib/validation'
import type { WodFields } from '../../_actions/copy-wod-to-dates'

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

type WodRow = {
  title: string; description: string; scoring_type: string
  strength_title: string | null; strength_description: string | null
  strength_lift: string | null; strength_sets: StrengthSet[] | null
  scaling?: ScalingTier[] | null
}

export default async function DayEditorPage(ctx: {
  params: Promise<{ date: string }>
  searchParams: Promise<{ template?: string }>
}) {
  const params = await ctx.params
  const searchParams = await ctx.searchParams

  if (!DATE_RE.test(params.date)) notFound()

  const { supabase, profile, boxName } = await requireStaffPage()

  const [{ data: workout }, { data: templates }] = await Promise.all([
    supabase.from('workouts')
      .select('title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets, scaling')
      .eq('box_id', profile.box_id).eq('date', params.date).maybeSingle(),
    supabase.from('workout_templates')
      .select('id, title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets')
      .eq('box_id', profile.box_id).order('title'),
  ])

  // Prefill precedence: an explicitly chosen template overrides the saved day.
  const chosen = searchParams.template
    ? (templates ?? []).find((t) => t.id === searchParams.template) ?? null
    : null
  const source = (chosen ?? workout) as WodRow | null

  const existing = source && {
    title: source.title, description: source.description, scoring_type: source.scoring_type,
    strength_title: source.strength_title, strength_description: source.strength_description,
    strength_lift: source.strength_lift, strength_sets: source.strength_sets, scaling: source.scaling ?? null,
  }

  const actionFields: WodFields | null = workout && {
    title: workout.title, description: workout.description, scoringType: workout.scoring_type,
    strengthTitle: workout.strength_title, strengthDescription: workout.strength_description,
    strengthLift: workout.strength_lift, strengthSets: workout.strength_sets, scaling: (workout as { scaling?: ScalingTier[] | null }).scaling ?? null,
  }

  const prettyDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(params.date + 'T00:00:00Z'))

  return (
    <DashboardShell
      active="programming"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title={
        <span className="flex items-center gap-3">
          <Link
            href={`/dashboard/programming?month=${params.date.slice(0, 7)}`}
            className="font-sans text-[13px] font-normal tracking-normal text-ink-3 transition-colors hover:text-ink"
          >
            ← Calendar
          </Link>
          <span className="text-base font-normal text-line-strong">/</span>
          <span>{prettyDate}</span>
        </span>
      }
      actions={<LoadFromLibrary date={params.date} templates={(templates ?? []).map((t) => ({ id: t.id, title: t.title }))} />}
    >
      <div className="max-w-2xl">
        <Card className="p-5">
          <WodForm date={params.date} existing={existing ?? null} />
          {actionFields && <DayActions date={params.date} fields={actionFields} />}
        </Card>
      </div>
    </DashboardShell>
  )
}
