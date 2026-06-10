'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendSmsCampaign } from '../_actions/send-sms-campaign'
import { previewSmsAudience } from '../_actions/preview-sms-audience'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import { smsSegments } from '@/lib/sms'

const SEGMENTS: Segment[] = ['all', 'paid', 'unpaid', 'trial', 'frozen']

export function SmsComposeForm({ tags, configured }: { tags: string[]; configured: boolean }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<Segment>('all')
  const [tag, setTag] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const seg = useMemo(() => smsSegments(body), [body])

  function refreshCount(nextStatus: Segment, nextTag: string) {
    start(async () => {
      const res = await previewSmsAudience(nextStatus, nextTag || null)
      setCount(res.error ? null : res.included ?? 0)
    })
  }

  function onSend() {
    setError(null)
    if (count !== null && !confirm(`Send to ${count} member${count === 1 ? '' : 's'}?`)) return
    start(async () => {
      const res = await sendSmsCampaign(body, status, tag || null)
      if (res.error) { setError(res.error); return }
      router.push(`/dashboard/sms/${res.campaignId}`)
    })
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 28 }}>
      {!configured && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--c-warn-soft)', color: 'var(--c-warn-ink)', fontSize: 13 }}>
          SMS isn’t configured yet. Add your Twilio credentials + sender ID to send.
        </div>
      )}
      <textarea
        style={{ ...inputStyle, minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }}
        placeholder="Your message… Use {{first_name}} to personalise."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>
        {seg.chars} chars · {seg.segments} segment{seg.segments === 1 ? '' : 's'} · {seg.encoding === 'gsm7' ? 'GSM-7' : 'Unicode'}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select style={{ ...inputStyle, width: 'auto' }} value={status} onChange={(e) => { const s = e.target.value as Segment; setStatus(s); refreshCount(s, tag) }}>
          {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 'auto' }} value={tag} onChange={(e) => { setTag(e.target.value); refreshCount(status, e.target.value) }}>
          <option value="">Any tag</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--c-ink-muted)' }}>
          {count === null ? 'Choose an audience to preview count' : `${count} recipient${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}

      <button onClick={onSend} disabled={pending || !configured || !body.trim()} style={{ alignSelf: 'flex-start', padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending || !configured ? 0.6 : 1 }}>
        {pending ? 'Sending…' : 'Send SMS'}
      </button>
    </div>
  )
}
