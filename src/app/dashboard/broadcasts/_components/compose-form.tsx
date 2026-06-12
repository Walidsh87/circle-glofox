'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { sendBroadcast } from '../_actions/send-broadcast'
import { previewAudience } from '../_actions/preview-audience'
import { saveTemplate } from '../_actions/save-template'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import { renderBlocks, flattenBlocks, type Block } from '@/lib/email-blocks'
import { BlockEditor } from './block-editor'

const SEGMENTS: Segment[] = ['all', 'paid', 'unpaid', 'trial', 'frozen']

export type TemplateOption = { id: string; name: string; subject: string; body_blocks: Block[] }

const inputClass =
  'rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

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

  return (
    <Card className="mb-7 flex flex-col gap-3.5 p-4">
      <div className="flex flex-wrap gap-2.5">
        <input className={`${inputClass} min-w-[200px] flex-1`} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        {templates.length > 0 && (
          <select className={inputClass} defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.currentTarget.value = '' }}>
            <option value="">Start from template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      <BlockEditor value={blocks} onChange={setBlocks} />

      <div>
        <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">Preview</div>
        {/* eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks */}
        <div className="rounded-[10px] border border-line bg-white p-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>

      <div className="flex flex-wrap gap-2.5">
        <select className={inputClass} value={status} onChange={(e) => { const s = e.target.value as Segment; setStatus(s); refreshCount(s, tag) }}>
          {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
        </select>
        <select className={inputClass} value={tag} onChange={(e) => { setTag(e.target.value); refreshCount(status, e.target.value) }}>
          <option value="">Any tag</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="self-center text-[13px] text-ink-3">
          {count === null ? 'Choose an audience to preview count' : `${count} recipient${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}

      <div className="flex gap-2.5">
        <Button onClick={onSend} disabled={pending || !subject.trim()}>
          {pending ? 'Working…' : 'Send campaign'}
        </Button>
        <Button variant="outline" onClick={onSaveTemplate} disabled={pending}>
          Save as template
        </Button>
      </div>
    </Card>
  )
}
