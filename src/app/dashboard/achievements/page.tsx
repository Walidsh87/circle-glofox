import Link from 'next/link'
import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { buildAchievements, type AchievementRecord } from '@/lib/achievements'

export default async function AchievementsPage() {
  const { supabase, profile, boxName, box } = await requirePage()

  const { data: rows } = await supabase
    .from('member_achievements')
    .select('kind, threshold, earned_at')
    .eq('athlete_id', profile.id)
    .eq('box_id', profile.box_id)
    .order('threshold')

  const view = buildAchievements((rows ?? []) as AchievementRecord[], box.timezone ?? 'Asia/Dubai')

  return (
    <DashboardShell
      active="achievements"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Achievements"
    >
      <div className="flex max-w-[600px] flex-col gap-6">
        {view.counts.total === 0 ? (
          <div className="rounded-[14px] border border-line bg-surface px-6 py-12 text-center text-[13px] text-ink-3">
            No badges yet — keep showing up. Your first badge is at 25 check-ins or a 4-week streak.{' '}
            <Link href="/dashboard/schedule" className="text-accent-ink underline-offset-2 hover:underline">
              Book a class
            </Link>{' '}
            or check out the{' '}
            <Link href="/dashboard/committed-club" className="text-accent-ink underline-offset-2 hover:underline">
              Committed Club
            </Link>
            .
          </div>
        ) : null}

        {/* Milestones section */}
        <div className="flex flex-col gap-3">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
            🏆 Milestones
          </div>
          {view.milestones.length === 0 ? (
            <div className="rounded-[10px] border border-line bg-surface px-4 py-3 text-[13px] text-ink-3">
              No milestones earned yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {view.milestones.map((badge) => (
                <div
                  key={badge.threshold}
                  className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 shadow-card"
                >
                  <span className="text-xl">🏆</span>
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold text-ink">
                      {badge.threshold} check-ins
                    </div>
                    <div className="font-mono text-[11.5px] text-ink-3">
                      Earned {badge.earnedLabel}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {view.nextMilestone !== null && (
            <div className="px-1 font-mono text-[11.5px] text-ink-3">
              Next: {view.nextMilestone} check-ins
            </div>
          )}
        </div>

        {/* Streaks section */}
        <div className="flex flex-col gap-3">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
            🔥 Streaks
          </div>
          {view.streaks.length === 0 ? (
            <div className="rounded-[10px] border border-line bg-surface px-4 py-3 text-[13px] text-ink-3">
              No streak badges yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {view.streaks.map((badge) => (
                <div
                  key={badge.threshold}
                  className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 shadow-card"
                >
                  <span className="text-xl">🔥</span>
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold text-ink">
                      {badge.threshold}-week streak
                    </div>
                    <div className="font-mono text-[11.5px] text-ink-3">
                      Earned {badge.earnedLabel}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {view.nextStreak !== null && (
            <div className="px-1 font-mono text-[11.5px] text-ink-3">
              Next: {view.nextStreak}-week streak
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
