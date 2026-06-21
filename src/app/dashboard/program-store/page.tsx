import { requireProgrammingPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import Link from 'next/link'

export default async function ProgramStorePage() {
  const { supabase, profile, boxName } = await requireProgrammingPage()

  const { data: templates } = await supabase
    .from('member_programs')
    .select('id, title, notes, published, price_aed')
    .eq('box_id', profile.box_id)
    .eq('is_template', true)
    .order('created_at', { ascending: false })

  const rows = (templates ?? []) as {
    id: string
    title: string
    notes: string | null
    published: boolean
    price_aed: number | null
  }[]

  return (
    <DashboardShell
      active="program-store"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Program Store"
      actions={
        <Link
          href="/dashboard/program-store/new"
          className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
        >
          + New program
        </Link>
      }
    >
      <div className="flex flex-col gap-3 p-5 md:p-8">
        {rows.length === 0 && (
          <p className="text-[13px] text-ink-3">
            No program templates yet.{' '}
            <Link href="/dashboard/program-store/new" className="text-accent-ink underline underline-offset-2">
              Create your first one.
            </Link>
          </p>
        )}
        {rows.map((t) => (
          <Link
            key={t.id}
            href={`/dashboard/program-store/${t.id}`}
            className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-ink">{t.title}</div>
              {t.notes && (
                <div className="mt-0.5 truncate text-[12.5px] text-ink-3">{t.notes}</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {t.published ? (
                <>
                  <span className="rounded bg-accent-soft px-1.5 py-px font-mono text-[10px] font-semibold text-accent-ink">
                    Published
                  </span>
                  {t.price_aed != null && (
                    <span className="text-[12.5px] font-semibold text-ink">
                      AED {t.price_aed}
                    </span>
                  )}
                </>
              ) : (
                <span className="rounded bg-surface-2 px-1.5 py-px font-mono text-[10px] font-semibold text-ink-3">
                  Draft
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </DashboardShell>
  )
}
