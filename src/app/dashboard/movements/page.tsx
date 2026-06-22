import { requirePage } from '@/lib/auth/page-guards'
import { PROGRAMMING_ROLES } from '@/lib/auth/roles'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { MovementLibrary } from './_components/movement-library'

export default async function MovementsPage() {
  const { supabase, profile, boxName } = await requirePage()
  const canManage = (PROGRAMMING_ROLES as readonly string[]).includes(profile.role)

  const { data: rows } = await supabase
    .from('movement_videos')
    .select('slug, label, video_url')
    .eq('box_id', profile.box_id)
  const videos = (rows ?? []) as { slug: string; label: string; video_url: string }[]

  const catalog = LIFT_NAMES.map((l) => ({ slug: l.value, label: l.label }))
  const catalogSlugs = new Set(catalog.map((c) => c.slug))
  const bySlug = Object.fromEntries(videos.map((v) => [v.slug, v]))
  const custom = videos.filter((v) => !catalogSlugs.has(v.slug)).map((v) => ({ slug: v.slug, label: v.label }))

  return (
    <DashboardShell active="movements" userName={profile.full_name!} userRole={profile.role} boxName={boxName} title="Movement library">
      <MovementLibrary catalog={catalog} custom={custom} videos={bySlug} canManage={canManage} />
    </DashboardShell>
  )
}
