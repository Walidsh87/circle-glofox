import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { SKILLS, overallBelt, beltRank, type Belt } from '@/lib/skills'
import { BeltChip } from '@/components/belt-chip'

export default async function SkillsPage() {
  const { supabase, user, profile, boxName } = await requirePage()

  const { data: rows } = await supabase.from('skill_levels').select('skill_key, belt').eq('athlete_id', user.id)
  const levels: Record<string, string> = Object.fromEntries((rows ?? []).map((r) => [r.skill_key, r.belt]))
  const overall = overallBelt(levels)
  const assessed = SKILLS.filter((s) => levels[s.key]).length
  const categories = [...new Set(SKILLS.map((s) => s.category))]

  return (
    <DashboardShell
      active="skills"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Skills"
    >
      <div className="flex max-w-[560px] flex-col gap-5">
        <div className="flex items-center gap-2.5 rounded-[14px] border border-line bg-surface px-4 py-3.5 shadow-card">
          <span className="text-[13px] text-ink-3">Overall belt</span>
          {overall ? <BeltChip belt={overall} /> : <span className="text-[13px] text-ink-3">not assessed yet</span>}
          <span className="ml-auto font-mono text-[11.5px] text-ink-3">{assessed}/{SKILLS.length} assessed</span>
        </div>
        {categories.map((cat) => (
          <div key={cat}>
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{cat}</div>
            <div className="flex flex-col gap-1.5">
              {SKILLS.filter((s) => s.category === cat).map((s) => {
                const belt = levels[s.key]
                return (
                  <div key={s.key} className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3.5 py-2.5">
                    <span className="flex-1 text-[13.5px] text-ink">{s.label}</span>
                    {belt && beltRank(belt) >= 0 ? <BeltChip belt={belt as Belt} /> : <span className="text-[12.5px] text-ink-faint">—</span>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  )
}
