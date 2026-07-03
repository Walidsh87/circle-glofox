import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { SKILL_BESTS, SKILL_BEST_CATEGORIES, currentBests, formatBestValue } from '@/lib/skill-bests'
import { LogBestForm } from './_components/log-best-form'

// Self-view: any signed-in user sees + logs their OWN bests (RLS bests_self_manage).
export default async function SkillBestsPage() {
  const { supabase, user, profile, boxName } = await requirePage()

  const { data: rows } = await supabase
    .from('athlete_skill_bests')
    .select('skill_key, value')
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
  const bests = currentBests((rows ?? []) as { skill_key: string; value: number }[])
  const loggedCount = SKILL_BESTS.filter((s) => bests[s.key] !== undefined).length

  return (
    <DashboardShell
      active="skills"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Skill bests"
    >
      <div className="flex max-w-[560px] flex-col gap-5">
        <div className="rounded-[14px] border border-line bg-surface px-4 py-3.5 shadow-card">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-ink">Log a best</span>
            <span className="font-mono text-[11.5px] text-ink-3">{loggedCount}/{SKILL_BESTS.length} logged</span>
          </div>
          <LogBestForm />
        </div>

        {SKILL_BEST_CATEGORIES.map((cat) => (
          <div key={cat}>
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{cat}</div>
            <div className="flex flex-col gap-1.5">
              {SKILL_BESTS.filter((s) => s.category === cat).map((s) => {
                const best = bests[s.key]
                return (
                  <div key={s.key} className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3.5 py-2.5">
                    <span className="flex-1 text-[13.5px] text-ink">{s.label}</span>
                    {best !== undefined
                      ? <span className="font-mono text-[13px] font-semibold text-ink">{formatBestValue(s.key, best)}</span>
                      : <span className="text-[12.5px] text-ink-faint">—</span>}
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
