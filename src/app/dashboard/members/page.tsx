import { requireStaffPage } from '@/lib/auth/page-guards'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { TabNav } from '@/components/ui/tab-nav'
import { cn } from '@/lib/utils'
import { AddMemberForm } from './_components/add-member-form'
import { AddLeadForm } from './_components/add-lead-form'
import { LeadsList, type Lead } from './_components/leads-list'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { PeopleHeader } from './_components/people-header'
import { PeopleTable, type PersonRow } from './_components/people-table'
import { groupBy, groupByInto } from '@/lib/grouping'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { todayInTimezone } from '@/lib/timezone'
import { lastVisit } from './_lib/last-visit'

type Tab = 'members' | 'staff' | 'leads'

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; tag?: string }>
}) {
  const sp = await searchParams
  const { supabase, user, profile, boxName, box } = await requireStaffPage()
  const isOwner = profile.role === 'owner'

  const allowedTabs: Tab[] = isOwner ? ['members', 'staff', 'leads'] : ['members', 'leads']
  const tab: Tab = (allowedTabs.includes(sp.tab as Tab) ? sp.tab : 'members') as Tab

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
  const tagFilter = sp.tag ?? null
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
  const tagsByAthlete = groupByInto(tagRows ?? [], (r) => r.athlete_id, (r) => r.tag)
  const allTags = [...new Set((tagRows ?? []).map((r) => r.tag))].sort()
  const shownPeople = (people ?? []).filter((p) => !tagFilter || (tagsByAthlete.get(p.id) ?? []).includes(tagFilter))

  // Enriched rows for the members/staff table. Membership status + last visit are
  // athlete-only, so they're fetched (and populated) only on the members tab.
  let rows: PersonRow[] = []
  if (tab !== 'leads') {
    if (tab === 'members') {
      const tz = box.timezone ?? 'Asia/Dubai'
      const today = todayInTimezone(tz)
      const dayInTz = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      // Bound both enrichment queries to the shown members (mirrors retention/prep), not the whole box.
      const athleteIds = shownPeople.map((p) => p.id)
      const [{ data: mems }, { data: visits }] = await Promise.all([
        supabase.from('memberships').select('athlete_id, payment_status, end_date, frozen_from, frozen_until').eq('box_id', profile.box_id).in('athlete_id', athleteIds),
        supabase.from('bookings').select('athlete_id, class_instances(starts_at)').eq('box_id', profile.box_id).eq('checked_in', true).in('athlete_id', athleteIds),
      ])
      const memsByAthlete = groupBy((mems ?? []) as (MembershipRow & { athlete_id: string })[], (m) => m.athlete_id)
      const lastVisitByAthlete = new Map<string, string>()
      for (const v of (visits ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }[]) {
        const ci = Array.isArray(v.class_instances) ? v.class_instances[0] : v.class_instances
        if (!ci?.starts_at) continue
        const d = dayInTz.format(new Date(ci.starts_at))
        const prev = lastVisitByAthlete.get(v.athlete_id)
        if (!prev || d > prev) lastVisitByAthlete.set(v.athlete_id, d)
      }
      rows = shownPeople.map((p) => {
        const lv = lastVisit(lastVisitByAthlete.get(p.id) ?? null, today)
        return {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          role: p.role,
          tags: tagsByAthlete.get(p.id) ?? [],
          status: getMembershipStatus(memsByAthlete.get(p.id) ?? [], today),
          lastVisitLabel: lv.label,
          lastVisitStale: lv.stale,
        }
      })
    } else {
      rows = shownPeople.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        role: p.role,
        tags: tagsByAthlete.get(p.id) ?? [],
        status: null,
        lastVisitLabel: null,
        lastVisitStale: false,
      }))
    }
  }

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

  const chip = 'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors'
  const tagChips = allTags.length > 0 ? (
    <div className="flex flex-wrap gap-1.5">
      <Link
        href={`/dashboard/members?tab=${tab}`}
        className={cn(chip, !tagFilter ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-ink-3 hover:text-ink')}
      >
        All
      </Link>
      {allTags.map((t) => (
        <Link
          key={t}
          href={`/dashboard/members?tab=${tab}&tag=${encodeURIComponent(t)}`}
          className={cn(chip, tagFilter === t ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-ink-3 hover:text-ink')}
        >
          {t}
        </Link>
      ))}
    </div>
  ) : null

  return (
    <DashboardShell
      active="members"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="People"
    >
      <div className="mx-auto flex max-w-[1000px] flex-col gap-[18px]">
        <PeopleHeader
          boxName={boxName}
          addLabel={tab === 'leads' ? 'Add lead' : tab === 'staff' ? 'Add staff' : 'Add member'}
          exportSlot={
            isOwner ? (
              <DownloadCsvButton filename={csvExport.filename} headers={csvExport.headers} rows={csvExport.rows} />
            ) : null
          }
          addForm={
            tab === 'leads' ? (
              <AddLeadForm />
            ) : (
              <AddMemberForm
                roles={
                  tab === 'staff'
                    ? [{ value: 'coach', label: 'Coach' }, { value: 'admin', label: 'Admin' }, { value: 'receptionist', label: 'Receptionist' }]
                    : [{ value: 'athlete', label: 'Athlete' }]
                }
              />
            )
          }
        />

        <TabNav
          tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/dashboard/members?tab=${t.key}`, count: t.count }))}
          active={tab}
        />

        {tab === 'leads' ? (
          <LeadsList leads={(leads ?? []) as Lead[]} staff={(leadStaff ?? []) as { id: string; full_name: string | null }[]} />
        ) : (
          <PeopleTable
            rows={rows}
            tab={tab}
            isOwner={isOwner}
            currentUserId={user.id}
            tagChips={tagChips}
            emptyLabel={tagFilter ? `No ${tab} with the tag “${tagFilter}”.` : `No ${tab} yet.`}
          />
        )}
      </div>
    </DashboardShell>
  )
}
