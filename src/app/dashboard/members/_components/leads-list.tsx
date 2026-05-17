'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateLeadStatus } from '../_actions/update-lead'
import { deleteLead } from '../_actions/delete-lead'
import { convertLead } from '../_actions/convert-lead'

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

const SOURCE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  instagram: { label: 'Instagram', bg: '#F3E8FF', color: '#7C3AED' },
  tiktok:    { label: 'TikTok',    bg: '#FCE7F3', color: '#BE185D' },
  facebook:  { label: 'Facebook',  bg: '#DBEAFE', color: '#1D4ED8' },
  whatsapp:  { label: 'WhatsApp',  bg: '#DCFCE7', color: '#15803D' },
  walk_in:   { label: 'Walk-in',   bg: '#FEF3C7', color: '#B45309' },
  referral:  { label: 'Referral',  bg: '#CCFBF1', color: '#0F766E' },
  other:     { label: 'Other',     bg: 'var(--c-surface-alt)', color: 'var(--c-ink-muted)' },
}

const STATUSES = ['new', 'contacted', 'scheduled', 'converted', 'lost'] as const

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  new:       { bg: 'var(--c-surface-alt)',    color: 'var(--c-ink-muted)' },
  contacted: { bg: 'var(--c-warn-soft)',      color: 'var(--c-warn-ink)' },
  scheduled: { bg: 'var(--c-ok-soft)',        color: 'var(--c-ok-ink)' },
  converted: { bg: 'var(--circle-lime-soft)', color: 'var(--circle-lime-ink)' },
  lost:      { bg: 'var(--c-danger-soft)',    color: 'var(--c-danger)' },
}

function daysAgo(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function LeadCard({ lead }: { lead: Lead }) {
  const router = useRouter()
  const [status, setStatus] = useState(lead.status)
  const [isPending, startTransition] = useTransition()
  const src = SOURCE_STYLES[lead.source] ?? SOURCE_STYLES.other
  const stStyle = STATUS_STYLES[status] ?? STATUS_STYLES.new

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
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--c-shadow-sm)',
      opacity: isPending ? 0.55 : 1, transition: 'opacity 150ms',
    }}>
      {/* Name + badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--c-ink)', flex: 1, minWidth: 100 }}>
          {lead.full_name}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: src.bg, color: src.color }}>
          {src.label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: stStyle.bg, color: stStyle.color, textTransform: 'capitalize' }}>
          {status}
        </span>
      </div>

      {/* Contact line */}
      <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginBottom: lead.notes ? 8 : 10 }}>
        {[lead.phone, lead.email].filter(Boolean).join(' · ')}
        {lead.drop_in_date && ` · Drop-in: ${lead.drop_in_date}`}
        {' · '}Added {daysAgo(lead.created_at)}
      </div>

      {/* Notes */}
      {lead.notes && (
        <div style={{
          fontSize: 12.5, color: 'var(--c-ink-2)', marginBottom: 10,
          padding: '6px 10px', background: 'var(--c-surface-sunk)', borderRadius: 6,
          fontStyle: 'italic',
        }}>
          &ldquo;{lead.notes}&rdquo;
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => handleStatus(s)}
            disabled={isPending}
            style={{
              padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              border: status === s ? '1.5px solid currentColor' : '1px solid var(--c-border)',
              background: status === s ? STATUS_STYLES[s].bg : 'transparent',
              color: status === s ? STATUS_STYLES[s].color : 'var(--c-ink-muted)',
              cursor: isPending ? 'default' : 'pointer',
              textTransform: 'capitalize', transition: 'all 100ms',
            }}
          >{s}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleConvert}
          disabled={isPending}
          style={{
            padding: '4px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
            background: 'var(--circle-lime)', color: 'var(--circle-ink)',
            border: 'none', cursor: isPending ? 'default' : 'pointer',
          }}
        >→ Member</button>
        <button
          onClick={handleDelete}
          disabled={isPending}
          style={{
            padding: '4px 10px', borderRadius: 8, fontSize: 12,
            background: 'none', color: 'var(--c-ink-muted)',
            border: '1px solid var(--c-border)', cursor: isPending ? 'default' : 'pointer',
          }}
        >×</button>
      </div>
    </div>
  )
}

export function LeadsList({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) {
    return (
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 14, padding: '48px 24px', textAlign: 'center',
        color: 'var(--c-ink-muted)', fontSize: 13, boxShadow: 'var(--c-shadow-sm)',
      }}>
        No leads yet. Add your first social media inquiry above.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {leads.map(lead => <LeadCard key={lead.id} lead={lead} />)}
    </div>
  )
}
