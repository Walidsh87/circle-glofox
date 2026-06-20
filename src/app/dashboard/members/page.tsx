import { requireStaffPage } from '@/lib/auth/page-guards'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TabNav } from '@/components/ui/tab-nav'
import { Table, Th, Td } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { AddMemberForm } from './_components/add-member-form'
import { RemoveMemberButton } from './_components/remove-member-button'
import { ResetMfaButton } from './_components/reset-mfa-button'
import { AddLeadForm } from './_components/add-lead-form'
import { LeadsList, type Lead } from './_components/leads-list'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { RolePicker } from './_components/role-picker'

type Tab = 'members' | 'staff' | 'leads'

export default async function MembersPage({
  searchParams,
}: {
  searchParams: { tab?: string; tag?: string }
}) {
  const { supabase, user, profile, boxName } = await requireStaffPage()
  const isOwner = profile.role === 'owner'

  const allowedTabs: Tab[] = isOwner ? ['members', 'staff', 'leads'] : ['members', 'leads']
  const tab: Tab = (allowedTabs.includes(searchParams.tab as Tab) ? searchParams.tab : 'members') as Tab

  // Counts for all tabs
  const [{ count: memberCount }, { count: staffCount }, { count: leadCount }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id).eq('role', 'athlete'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id).in('role', [...ALL_STAFF_ROLES]),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id),
  ])

  // Tab-specific data
  const peopleBase = supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, created_at')
    .eq('box_id', profile.box_id)
    .order('created_at', { ascending: true })
  // Tab-specific data — all independent (filtered only by `tab`), fetched in parallel.
  const tagFilter = searchParams.tag ?? null
  const [{ data: people }, { data: leads }, { data: leadStaff }, { data: tagRows }] = await Promise.all([
    tab !== 'leads'
      ? (tab === 'staff' ? peopleBase.in('role', [...ALL_STAFF_ROLES]) : peopleBase.eq('role', 'athlete'))
      : Promise.resolve({ data: null }),
    tab === 'leads'
      ? supabase
          .from('leads')
          .select('id, full_name, phone, email, source, status, notes, drop_in_date, created_at')
          .eq('box_id', profile.box_id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: null }),
    // Staff list for the lead-row QuickAdd assignee picker (#60).
    tab === 'leads'
      ? supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).in('role', [...ALL_STAFF_ROLES]).order('full_name')
      : Promise.resolve({ data: null }),
    // Tags (#33): box-scoped, grouped by athlete, for the members/coaches tabs.
    tab !== 'leads'
      ? supabase.from('member_tags').select('athlete_id, tag').eq('box_id', profile.box_id)
      : Promise.resolve({ data: [] as { athlete_id: string; tag: string }[] }),
  ])
  const tagsByAthlete = new Map<string, string[]>()
  for (const r of tagRows ?? []) {
    const arr = tagsByAthlete.get(r.athlete_id) ?? []
    arr.push(r.tag)
    tagsByAthlete.set(r.athlete_id, arr)
  }
  const allTags = [...new Set((tagRows ?? []).map((r) => r.tag))].sort()
  const shownPeople = (people ?? []).filter((p) => !tagFilter || (tagsByAthlete.get(p.id) ?? []).includes(tagFilter))

  // CSV export for the active tab's table (#54)
  const csvExport = tab === 'leads'
    ? {
        filename: 'leads.csv',
        headers: ['Name', 'Phone', 'Email', 'Source', 'Status', 'Notes', 'Drop-in date', 'Created'],
        rows: (leads ?? []).map((l) => [l.full_name, l.phone, l.email, l.source, l.status, l.notes, l.drop_in_date, l.created_at?.slice(0, 10)]),
      }
    : {
        filename: tab === 'staff' ? 'staff.csv' : 'members.csv',
        headers: ['Name', 'Email', 'Phone', 'Role'],
        rows: shownPeople.map((p) => [p.full_name, p.email, p.phone, p.role]),
      }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'members', label: 'Members', count: memberCount ?? 0 },
    ...(isOwner ? [{ key: 'staff' as Tab, label: 'Staff', count: staffCount ?? 0 }] : []),
    { key: 'leads', label: 'Leads', count: leadCount ?? 0 },
  ]

  return (
    <DashboardShell
      active="members"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="People"
      actions={isOwner ? <DownloadCsvButton filename={csvExport.filename} headers={csvExport.headers} rows={csvExport.rows} /> : undefined}
    >
      <div className="mb-5 -mt-1">
        <TabNav
          tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/dashboard/members?tab=${t.key}`, count: t.count }))}
          active={tab}
        />
      </div>

      {/* ── Leads tab ── */}
      {tab === 'leads' && (
        <>
          <Card className="mb-5 p-5">
            <p className="mb-3 text-[13px] font-semibold text-ink">Add lead</p>
            <AddLeadForm />
          </Card>
          <LeadsList leads={(leads ?? []) as Lead[]} staff={(leadStaff ?? []) as { id: string; full_name: string | null }[]} />
        </>
      )}

      {/* ── Members / Coaches tab ── */}
      {tab !== 'leads' && (
        <>
          <Card className="mb-5 p-5">
            <p className="mb-3 text-[13px] font-semibold text-ink">
              Add {tab === 'staff' ? 'staff' : 'member'}
            </p>
            <AddMemberForm roles={tab === 'staff'
              ? [{ value: 'coach', label: 'Coach' }, { value: 'admin', label: 'Admin' }, { value: 'receptionist', label: 'Receptionist' }]
              : [{ value: 'athlete', label: 'Athlete' }]} />
          </Card>

          {allTags.length > 0 && (
            <div className="mb-3.5 flex flex-wrap gap-1.5">
              <Link
                href={`/dashboard/members?tab=${tab}`}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
                  !tagFilter ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-ink-3 hover:text-ink'
                )}
              >
                All
              </Link>
              {allTags.map((t) => (
                <Link
                  key={t}
                  href={`/dashboard/members?tab=${tab}&tag=${encodeURIComponent(t)}`}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
                    tagFilter === t ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-ink-2 hover:text-ink'
                  )}
                >
                  {t}
                </Link>
              ))}
            </div>
          )}

          <Table>
            <thead>
              <tr className="bg-surface-2">
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Role</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {shownPeople.map((member) => (
                <tr key={member.id} className="last:[&>td]:border-0">
                  <Td className="font-semibold">
                    <Link
                      href={`/dashboard/members/${member.id}`}
                      className="text-ink transition-colors hover:text-accent-ink"
                    >
                      {member.full_name}
                    </Link>
                    {(tagsByAthlete.get(member.id) ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(tagsByAthlete.get(member.id) ?? []).map((t) => (
                          <Badge key={t} tone="accent" className="font-mono text-[10px] font-bold">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Td>
                  <Td className="text-ink-3">{member.email}</Td>
                  <Td className="text-ink-3">{member.phone ?? '—'}</Td>
                  <Td>
                    {tab === 'staff' && isOwner && member.role !== 'owner' && member.id !== user.id ? (
                      <RolePicker profileId={member.id} role={member.role} />
                    ) : (
                      <Badge tone={member.role === 'athlete' ? 'neutral' : 'ok'} className="capitalize">
                        {member.role}
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {tab === 'staff' && isOwner && (
                        <ResetMfaButton profileId={member.id} name={member.full_name} />
                      )}
                      {isOwner && member.id !== user.id && (
                        <RemoveMemberButton memberId={member.id} memberName={member.full_name} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {shownPeople.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-ink-3">
                    {tagFilter ? `No ${tab} with the tag “${tagFilter}”.` : `No ${tab} yet.`}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </>
      )}
    </DashboardShell>
  )
}
