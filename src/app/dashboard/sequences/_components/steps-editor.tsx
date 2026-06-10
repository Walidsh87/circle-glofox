'use client'

import { useMemo } from 'react'
import { BlockEditor } from '@/app/dashboard/broadcasts/_components/block-editor'
import { renderBlocks, type Block } from '@/lib/email-blocks'
import type { SequenceStep } from '@/lib/sequences'

const MAX_STEPS = 20
const field = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-bg)', fontSize: 13.5, color: 'var(--c-ink)' } as const
const ctrl = { padding: '2px 8px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 13 } as const

function StepPreview({ blocks }: { blocks: Block[] }) {
  const html = useMemo(() => renderBlocks(blocks, { firstName: 'Alex' }), [blocks])
  return (
    <div>
      <div className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-ink-muted)', margin: '6px 0' }}>Preview</div>
      {/* eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks */}
      <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: 12, background: '#fff' }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

export function StepsEditor({ value, onChange }: { value: SequenceStep[]; onChange: (s: SequenceStep[]) => void }) {
  function update(i: number, patch: Partial<SequenceStep>) {
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = value.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function remove(i: number) { onChange(value.filter((_, j) => j !== i)) }
  function add() { if (value.length < MAX_STEPS) onChange([...value, { offset_days: value.length ? value[value.length - 1].offset_days + 3 : 0, subject: '', body_blocks: [{ type: 'paragraph', text: '' }] }]) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {value.map((s, i) => (
        <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 12, padding: 14, background: 'var(--c-bg)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)', flex: 1 }}>STEP {i + 1}</span>
            <button type="button" style={ctrl} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" style={ctrl} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" style={ctrl} onClick={() => remove(i)} aria-label="Remove">✕</button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
            Send
            <input type="number" min={0} style={{ ...field, width: 80 }} value={s.offset_days} onChange={(e) => update(i, { offset_days: e.target.value === '' ? 0 : Number(e.target.value) })} />
            days after enrolling
          </label>
          <input style={field} placeholder="Email subject" value={s.subject} onChange={(e) => update(i, { subject: e.target.value })} />
          <BlockEditor value={s.body_blocks} onChange={(b) => update(i, { body_blocks: b })} />
          <StepPreview blocks={s.body_blocks} />
        </div>
      ))}
      <button type="button" style={ctrl} onClick={add} disabled={value.length >= MAX_STEPS}>+ Add step</button>
    </div>
  )
}
