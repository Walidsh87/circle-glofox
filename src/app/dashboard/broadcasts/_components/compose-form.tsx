'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendBroadcast } from '../_actions/send-broadcast'
import { previewAudience } from '../_actions/preview-audience'
import { saveTemplate } from '../_actions/save-template'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import { renderBlocks, flattenBlocks, type Block } from '@/lib/email-blocks'
import { BlockEditor } from './block-editor'

const SEGMENTS: Segment[] = ['all', 'paid', 'unpaid', 'trial', 'frozen']

export type TemplateOption = { id: string; name: string; subject: string; body_blocks: Block[] }

export function ComposeForm({ tags, templates }: { tags: string[]; templates: TemplateOption[] }) {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([{ type: 'paragraph', text: '' }])
  const [status, setStatus] = useState<Segment>('all')
  const [tag, setTag] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const previewHtml = useMemo(() => renderBlocks(blocks, { firstName: 'Alex' }), [blocks])

  function refreshCount(nextStatus: Segment, nextTag: string) {
    start(async () => {
      const res = await previewAudience(nextStatus, nextTag || null)
      setCount(res.error ? null : res.included ?? 0)
    })
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setSubject(t.subject)
    setBlocks(t.body_blocks.length ? t.body_blocks : [{ type: 'paragraph', text: '' }])
  }

  function onSaveTemplate() {
    const name = prompt('Template name?')
    if (!name) return
    start(async () => {
      const res = await saveTemplate(name, subject, blocks)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  function onSend() {
    setError(null)
    if (count !== null && !confirm(`Send to ${count} member${count === 1 ? '' : 's'}?`)) return
    start(async () => {
      const res = await sendBroadcast(subject, flattenBlocks(blocks), status, tag || null, blocks)
      if (res.error) { setError(res.error); return }
      router.push(`/dashboard/broadcasts/${res.broadcastId}`)
    })
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 28 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        {templates.length > 0 && (
          <select style={{ ...inputStyle, width: 'auto' }} defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.currentTarget.value = '' }}>
            <option value="">Start from template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      <BlockEditor value={blocks} onChange={setBlocks} />

      <div>
        <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-ink-muted)', marginBottom: 6 }}>Preview</div>
        {/* eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks */}
        <div style={{ border: '1px solid var(--c-border)', borderRadius: 10, padding: 16, background: '#fff' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
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

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onSend} disabled={pending || !subject.trim()} style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Working…' : 'Send campaign'}
        </button>
        <button onClick={onSaveTemplate} disabled={pending} style={{ padding: '10px 18px', background: 'var(--c-surface)', color: 'var(--c-ink)', border: '1px solid var(--c-border)', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
          Save as template
        </button>
      </div>
    </div>
  )
}
