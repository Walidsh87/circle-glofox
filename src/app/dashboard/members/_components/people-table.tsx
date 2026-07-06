'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Table, Th, Td } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { MembershipStatus } from '@/lib/membership-status'
import { RolePicker } from './role-picker'
import { ResetMfaButton } from './reset-mfa-button'
import { RemoveMemberButton } from './remove-member-button'

export type PersonRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: string
  tags: string[]
  status: MembershipStatus | null
  lastVisitLabel: string | null
  lastVisitStale: boolean
}

function initials(name: string | null) {
  return (
    (name ?? '')
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

const STATUS_PILL: Record<MembershipStatus, { label: string; cls: string }> = {
  paid: { label: 'Active', cls: 'bg-ok-soft text-ok' },
  unpaid: { label: 'Unpaid', cls: 'bg-warn-soft text-warn' },
  frozen: { label: 'Frozen', cls: 'border border-line bg-surface-2 text-ink-3' },
  no_membership: { label: 'No plan', cls: 'border border-line bg-surface-2 text-ink-3' },
}

export function PeopleTable({
  rows,
  tab,
  isOwner,
  currentUserId,
  tagChips,
  emptyLabel,
}: {
  rows: PersonRow[]
  tab: 'members' | 'staff'
  isOwner: boolean
  currentUserId: string
  tagChips: ReactNode
  emptyLabel: string
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? rows.filter((r) => [r.full_name, r.email, r.phone].some((f) => (f ?? '').toLowerCase().includes(needle)))
    : rows
  const colSpan = tab === 'members' ? 6 : 5

  return (
    <div className="flex flex-col gap-3.5">
      {/* Toolbar: search + existing tag chips */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-0 max-w-[320px] flex-1 items-center gap-2 rounded-[9px] border border-line bg-surface px-2.5 py-[7px] transition-colors focus-within:border-line-strong">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-ink-faint" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, phone…"
            aria-label="Search people"
            className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
        {tagChips}
      </div>

      <Table>
        <thead>
          <tr className="bg-surface-2">
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Phone</Th>
            {tab === 'members' ? (
              <>
                <Th>Status</Th>
                <Th>Last visit</Th>
              </>
            ) : (
              <Th>Role</Th>
            )}
            <Th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => {
            const hasTags = p.tags.length > 0
            return (
              <tr
                key={p.id}
                onClick={() => router.push(`/dashboard/members/${p.id}`)}
                className="cursor-pointer transition-colors last:[&>td]:border-0 hover:bg-surface-2"
              >
                <Td>
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10.5px] font-bold',
                        hasTags ? 'bg-accent-soft text-accent-ink' : 'border border-line bg-surface-2 text-ink-2'
                      )}
                    >
                      {initials(p.full_name)}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/members/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[13.5px] font-semibold text-ink transition-colors hover:text-accent-ink"
                      >
                        {p.full_name}
                      </Link>
                      {hasTags && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.tags.map((t) => (
                            <Badge key={t} tone="accent" className="font-mono text-[9.5px] font-bold">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-[13px] text-ink-3">{p.email}</Td>
                <Td className="whitespace-nowrap font-mono text-xs text-ink-3">{p.phone ?? '—'}</Td>
                {tab === 'members' ? (
                  <>
                    <Td>
                      {p.status && (
                        <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold', STATUS_PILL[p.status].cls)}>
                          {STATUS_PILL[p.status].label}
                        </span>
                      )}
                    </Td>
                    <Td className={cn('whitespace-nowrap font-mono text-xs', p.lastVisitStale ? 'text-danger' : 'text-ink-3')}>
                      {p.lastVisitLabel ?? '—'}
                    </Td>
                  </>
                ) : (
                  <Td onClick={(e) => e.stopPropagation()} className="cursor-default">
                    {isOwner && p.role !== 'owner' && p.id !== currentUserId ? (
                      <RolePicker profileId={p.id} role={p.role} />
                    ) : (
                      <Badge tone={p.role === 'athlete' ? 'neutral' : 'ok'} className="capitalize">
                        {p.role}
                      </Badge>
                    )}
                  </Td>
                )}
                <Td onClick={(e) => e.stopPropagation()} className="cursor-default text-right">
                  <div className="flex items-center justify-end gap-2">
                    {tab === 'staff' && isOwner && <ResetMfaButton profileId={p.id} name={p.full_name} />}
                    {isOwner && p.id !== currentUserId && <RemoveMemberButton memberId={p.id} memberName={p.full_name} />}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-faint" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </div>
                </Td>
              </tr>
            )
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-4 py-10 text-center text-[13px] text-ink-3">
                {rows.length === 0 ? emptyLabel : `No ${tab} match your search.`}
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      {rows.length > 0 && (
        <div className="text-center font-mono text-[11px] text-ink-3">
          Showing {filtered.length} of {rows.length}
        </div>
      )}
    </div>
  )
}
