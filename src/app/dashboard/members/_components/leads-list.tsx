'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { updateLeadStatus } from '../_actions/update-lead'
import { deleteLead } from '../_actions/delete-lead'
import { convertLead } from '../_actions/convert-lead'
import { QuickAdd } from '@/app/dashboard/tasks/_components/quick-add'

export type Lead = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  source: string
  status: string
  notes: string | null
  drop_in_date: string | null
  created_at: string
}

export type Staff = { id: string; full_name: string | null }

// Source category colors are fixed brand-ish pastels (not theme tokens).
const SOURCE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  instagram: { label: 'Instagram', bg: '#F3E8FF', color: '#7C3AED' },
  tiktok:    { label: 'TikTok',    bg: '#FCE7F3', color: '#BE185D' },
  facebook:  { label: 'Facebook',  bg: '#DBEAFE', color: '#1D4ED8' },
  whatsapp:  { label: 'WhatsApp',  bg: '#DCFCE7', color: '#15803D' },
  walk_in:   { label: 'Walk-in',   bg: '#FEF3C7', color: '#B45309' },
  referral:  { label: 'Referral',  bg: '#CCFBF1', color: '#0F766E' },
  other:     { label: 'Other',     bg: '#E5E5E5', color: '#525252' },
}

const STATUSES = ['new', 'contacted', 'scheduled', 'converted', 'lost'] as const

const STATUS_CLASSES: Record<string, string> = {
  new:       'bg-surface-2 text-ink-3',
  contacted: 'bg-warn-soft text-warn',
  scheduled: 'bg-ok-soft text-ok',
  converted: 'bg-accent-soft text-accent-ink',
  lost:      'bg-danger-soft text-danger',
}

function daysAgo(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function LeadCard({ lead, staff }: { lead: Lead; staff: Staff[] }) {
  const router = useRouter()
  const [status, setStatus] = useState(lead.status)
  const [showFollowup, setShowFollowup] = useState(false)
  const [isPending, startTransition] = useTransition()
  const src = SOURCE_STYLES[lead.source] ?? SOURCE_STYLES.other
  const stClass = STATUS_CLASSES[status] ?? STATUS_CLASSES.new

  function handleStatus(newStatus: string) {
    const prev = status
    setStatus(newStatus)
    startTransition(async () => {
      const { error } = await updateLeadStatus(lead.id, newStatus)
      if (error) setStatus(prev)
    })
  }

  function handleDelete() {
    if (!confirm(`Delete ${lead.full_name}? This cannot be undone.`)) return
    startTransition(async () => { await deleteLead(lead.id) })
  }

  function handleConvert() {
    if (!lead.email) { alert('Add an email to this lead before converting.'); return }
    if (!confirm(`Convert ${lead.full_name} to a member?\nThey'll receive an account at ${lead.email}.`)) return
    startTransition(async () => {
      const result = await convertLead(lead.id)
      if (result.error) alert(result.error)
      else if (result.memberId) router.push(`/dashboard/members/${result.memberId}`)
    })
  }

  return (
    <Card className={cn('p-4 transition-opacity', isPending && 'opacity-55')}>
      {/* Name + badges */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="min-w-[100px] flex-1 text-sm font-semibold text-ink">
          {lead.full_name}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: src.bg, color: src.color }}
        >
          {src.label}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', stClass)}>
          {status}
        </span>
      </div>

      {/* Contact line */}
      <div className={cn('font-mono text-[11.5px] text-ink-3', lead.notes ? 'mb-2' : 'mb-2.5')}>
        {[lead.phone, lead.email].filter(Boolean).join(' · ')}
        {lead.drop_in_date && ` · Drop-in: ${lead.drop_in_date}`}
        {' · '}Added {daysAgo(lead.created_at)}
      </div>

      {/* Notes */}
      {lead.notes && (
        <div className="mb-2.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs italic text-ink-2">
          &ldquo;{lead.notes}&rdquo;
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => handleStatus(s)}
            disabled={isPending}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              status === s
                ? cn('border-current', STATUS_CLASSES[s])
                : 'border-line bg-transparent text-ink-3 hover:text-ink'
            )}
          >{s}</button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowFollowup((v) => !v)}
          disabled={isPending}
          className="rounded-lg border border-line px-2.5 py-1 text-[11.5px] text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >+ Follow-up</button>
        <Button size="sm" className="h-7 px-3 text-[11.5px]" onClick={handleConvert} disabled={isPending}>
          → Member
        </Button>
        <button
          onClick={handleDelete}
          disabled={isPending}
          aria-label={`Delete ${lead.full_name}`}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-3 transition-colors hover:border-danger hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >×</button>
      </div>
      {showFollowup && (
        <div className="mt-2.5">
          <QuickAdd leadId={lead.id} placeholder={`Follow-up for ${lead.full_name}…`} staff={staff} />
        </div>
      )}
    </Card>
  )
}

export function LeadsList({ leads, staff }: { leads: Lead[]; staff: Staff[] }) {
  if (leads.length === 0) {
    return (
      <Card className="px-6 py-12 text-center text-[13px] text-ink-3">
        No leads yet. Add your first social media inquiry above.
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {leads.map(lead => <LeadCard key={lead.id} lead={lead} staff={staff} />)}
    </div>
  )
}
