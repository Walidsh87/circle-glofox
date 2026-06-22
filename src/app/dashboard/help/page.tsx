import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { findGuide, guidesByArea } from '@/lib/help/registry'
import { AREA_LABELS } from '@/lib/help/types'
import { GuideBody } from './_components/guide-body'

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const sp = await searchParams
  const { profile, boxName } = await requireStaffPage()
  const guide = findGuide(sp.topic)
  const groups = guidesByArea()

  return (
    <DashboardShell active="help" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="Help Center">
      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="md:w-64 md:shrink-0">
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.area}>
                <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{AREA_LABELS[g.area]}</div>
                <div className="flex flex-col">
                  {g.guides.map((gd) => (
                    <Link key={gd.slug} href={`/dashboard/help?topic=${gd.slug}`}
                      className={`rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${guide?.slug === gd.slug ? 'bg-accent-soft font-semibold text-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
                      {gd.title}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>
        <article className="min-w-0 max-w-2xl flex-1">
          {guide ? (
            <>
              <h2 className="text-lg font-semibold text-ink">{guide.title}</h2>
              <p className="mt-1 text-[13px] text-ink-2">{guide.summary}</p>
              <div className="mt-4"><GuideBody blocks={guide.blocks} /></div>
            </>
          ) : <p className="text-[13px] text-ink-3">No help topics yet.</p>}
        </article>
      </div>
    </DashboardShell>
  )
}
