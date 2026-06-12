import { DashboardShell } from '@/components/shell/dashboard-shell'
import { requireOwnerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { Table, Th, Td } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AUDIT_ACTION_LABELS, describeAuditDetails, type AuditAction } from '@/lib/audit'

type AuditRow = {
  id: string
  actor_name: string
  action: string
  target: string
  details: Record<string, unknown> | null
  created_at: string
}

const ACTION_TONES: Record<string, 'warn' | 'danger' | 'neutral'> = {
  'invoice.refund': 'warn',
  'member.remove': 'danger',
}

export default async function AuditPage(props: { searchParams: Promise<{ action?: string }> }) {
  const sp = await props.searchParams
  const { supabase, profile, boxName, box } = await requireOwnerPage()
  const tz = box.timezone ?? 'Asia/Dubai'

  const actionFilter = sp.action && sp.action in AUDIT_ACTION_LABELS ? (sp.action as AuditAction) : null

  let query = supabase
    .from('audit_log')
    .select('id, actor_name, action, target, details, created_at')
    .eq('box_id', profile.box_id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (actionFilter) query = query.eq('action', actionFilter)
  const { data } = await query
  const rows = (data ?? []) as AuditRow[]

  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const pills = [
    { href: '/dashboard/audit', label: 'All', active: !actionFilter },
    ...Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => ({
      href: `/dashboard/audit?action=${key}`, label, active: actionFilter === key,
    })),
  ]

  return (
    <DashboardShell
      active="audit"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Audit log"
    >
      <div className="max-w-4xl">
        <p className="mb-4 text-sm text-ink-2">
          Refunds, role changes, member removals, and MFA resets — newest first, last 200 events.
        </p>

        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {pills.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className={cn(
                  'rounded-full border px-3.5 py-1 text-[12.5px] font-semibold transition-colors',
                  p.active ? 'border-transparent bg-accent text-accent-contrast' : 'border-line bg-surface text-ink-3 hover:border-line-strong'
                )}
              >
                {p.label}
              </Link>
            ))}
          </div>
          <DownloadCsvButton
            filename="audit-log.csv"
            headers={['When', 'Who', 'Action', 'Target', 'Details']}
            rows={rows.map((r) => [
              fmt.format(new Date(r.created_at)),
              r.actor_name,
              AUDIT_ACTION_LABELS[r.action as AuditAction] ?? r.action,
              r.target,
              describeAuditDetails(r.action, r.details),
            ])}
          />
        </div>

        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="last:[&>td]:border-0">
                <Td className="whitespace-nowrap text-ink-3">{fmt.format(new Date(r.created_at))}</Td>
                <Td>{r.actor_name}</Td>
                <Td>
                  <Badge tone={ACTION_TONES[r.action] ?? 'neutral'}>
                    {AUDIT_ACTION_LABELS[r.action as AuditAction] ?? r.action}
                  </Badge>
                </Td>
                <Td>{r.target}</Td>
                <Td className="text-ink-3">{describeAuditDetails(r.action, r.details)}</Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-ink-3">
                  No audited events yet — refunds, role changes, removals and MFA resets will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </DashboardShell>
  )
}
