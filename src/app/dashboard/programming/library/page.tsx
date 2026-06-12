import { requireProgrammingPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { LibraryList } from '../_components/library-list'
import type { TemplateExisting } from '../_components/template-form'

export default async function LibraryPage() {
  const { supabase, profile, boxName } = await requireProgrammingPage()

  const { data: templates } = await supabase
    .from('workout_templates')
    .select('id, title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets')
    .eq('box_id', profile.box_id)
    .order('title')

  return (
    <DashboardShell
      active="programming"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title={
        <span className="flex items-center gap-3">
          <Link
            href="/dashboard/programming"
            className="font-sans text-[13px] font-normal tracking-normal text-ink-3 transition-colors hover:text-ink"
          >
            ← Calendar
          </Link>
          <span className="text-base font-normal text-line-strong">/</span>
          <span>WOD Library</span>
        </span>
      }
    >
      <LibraryList templates={(templates ?? []) as NonNullable<TemplateExisting>[]} />
    </DashboardShell>
  )
}
