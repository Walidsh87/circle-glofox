import { requirePage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="skills" userName={profile.full_name!} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Skills</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)' }}>
              <span style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>Overall belt</span>
              {overall ? <BeltChip belt={overall} /> : <span style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>not assessed yet</span>}
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{assessed}/{SKILLS.length} assessed</span>
            </div>
            {categories.map((cat) => (
              <div key={cat}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{cat}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SKILLS.filter((s) => s.category === cat).map((s) => {
                    const belt = levels[s.key]
                    return (
                      <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                        <span style={{ flex: 1, fontSize: 13.5, color: 'var(--c-ink)' }}>{s.label}</span>
                        {belt && beltRank(belt) >= 0 ? <BeltChip belt={belt as Belt} /> : <span style={{ fontSize: 12.5, color: 'var(--c-ink-faint)' }}>—</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
