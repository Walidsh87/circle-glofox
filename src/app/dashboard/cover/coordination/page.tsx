import Link from 'next/link'
import { requireManagerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { Table, Th, Td } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { buildCoordinationView, type SubRequestRecord } from '@/lib/cover-coordination'

export default async function CoverCoordinationPage() {
  const { supabase, profile, boxName, box } = await requireManagerPage()

  const { data: rows } = await supabase
    .from('sub_requests')
    .select(
      'id, status, note, posted_at, claimed_at, class_instances(starts_at, duration_minutes, class_templates(name)), poster:posted_by(full_name), claimer:claimed_by(full_name)',
    )
    .eq('box_id', profile.box_id)

  const view = buildCoordinationView(
    (rows ?? []) as SubRequestRecord[],
    box.timezone ?? 'Asia/Dubai',
  )

  return (
    <DashboardShell active="cover" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="Cover coordination">
      <div className="flex max-w-[900px] flex-col gap-4">
        {/* Back link */}
        <Link
          href="/dashboard/cover"
          className="text-sm text-ink-3 hover:text-ink transition-colors"
        >
          ← Back to cover board
        </Link>

        {/* Count summary */}
        {view.counts.total > 0 && (
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">{view.counts.open}</span> open
            {' · '}
            <span className="font-semibold text-ink">{view.counts.claimed}</span> claimed
            {' · '}
            <span className="font-semibold text-ink">{view.counts.cancelled}</span> cancelled
          </p>
        )}

        {view.counts.total === 0 && (
          <EmptyState title="No cover requests yet." body="Cover requests will appear here once coaches start posting classes they need covered." />
        )}

        {/* Open section */}
        {view.open.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">
                Open ({view.counts.open})
              </h2>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th>When</Th>
                  <Th>Posted by</Th>
                  <Th>Posted</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {view.open.map((row) => (
                  <tr key={row.id}>
                    <Td className="font-semibold">{row.className}</Td>
                    <Td className="font-mono text-[12.5px]">{row.whenLabel}</Td>
                    <Td>{row.poster}</Td>
                    <Td className="font-mono text-[12.5px] text-ink-2">{row.postedLabel}</Td>
                    <Td className="text-ink-3">{row.note ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {/* Claimed section */}
        {view.claimed.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">
                Claimed ({view.counts.claimed})
              </h2>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th>When</Th>
                  <Th>Posted by</Th>
                  <Th>Claimed by</Th>
                  <Th>Posted</Th>
                  <Th>Claimed</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {view.claimed.map((row) => (
                  <tr key={row.id}>
                    <Td className="font-semibold">{row.className}</Td>
                    <Td className="font-mono text-[12.5px]">{row.whenLabel}</Td>
                    <Td>{row.poster}</Td>
                    <Td>{row.claimer ?? '—'}</Td>
                    <Td className="font-mono text-[12.5px] text-ink-2">{row.postedLabel}</Td>
                    <Td className="font-mono text-[12.5px] text-ink-2">{row.claimedLabel ?? '—'}</Td>
                    <Td className="text-ink-3">{row.note ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {/* Cancelled section */}
        {view.cancelled.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">
                Cancelled ({view.counts.cancelled})
              </h2>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th>When</Th>
                  <Th>Posted by</Th>
                  <Th>Posted</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {view.cancelled.map((row) => (
                  <tr key={row.id}>
                    <Td className="font-semibold">{row.className}</Td>
                    <Td className="font-mono text-[12.5px]">{row.whenLabel}</Td>
                    <Td>{row.poster}</Td>
                    <Td className="font-mono text-[12.5px] text-ink-2">{row.postedLabel}</Td>
                    <Td className="text-ink-3">{row.note ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    </DashboardShell>
  )
}
