import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { WodForm } from '@/app/dashboard/wod/_components/wod-form'
import { LoadFromLibrary } from '../../_components/load-from-library'
import { DayActions } from '../../_components/day-actions'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import type { WodFields } from '../../_actions/copy-wod-to-dates'

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

type WodRow = {
  title: string; description: string; scoring_type: string
  strength_title: string | null; strength_description: string | null
  strength_lift: string | null; strength_sets: StrengthSet[] | null
}

export default async function DayEditorPage(ctx: {
  params: Promise<{ date: string }>
  searchParams: Promise<{ template?: string }>
}) {
  const params = await ctx.params
  const searchParams = await ctx.searchParams

  if (!DATE_RE.test(params.date)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')
  if (!['owner', 'coach'].includes(profile.role)) redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const [{ data: workout }, { data: templates }] = await Promise.all([
    supabase.from('workouts')
      .select('title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets')
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
    strength_lift: source.strength_lift, strength_sets: source.strength_sets,
  }

  const actionFields: WodFields | null = workout && {
    title: workout.title, description: workout.description, scoringType: workout.scoring_type,
    strengthTitle: workout.strength_title, strengthDescription: workout.strength_description,
    strengthLift: workout.strength_lift, strengthSets: workout.strength_sets,
  }

  const prettyDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(params.date + 'T00:00:00Z'))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="programming" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0, gap: 12 }}>
          <Link href={`/dashboard/programming?month=${params.date.slice(0, 7)}`} style={{ fontSize: 13, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>← Calendar</Link>
          <span style={{ color: 'var(--c-border)' }}>/</span>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>{prettyDate}</h1>
          <LoadFromLibrary date={params.date} templates={(templates ?? []).map((t) => ({ id: t.id, title: t.title }))} />
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px', boxShadow: 'var(--c-shadow-sm)' }}>
              <WodForm date={params.date} existing={existing ?? null} />
              {actionFields && <DayActions date={params.date} fields={actionFields} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
