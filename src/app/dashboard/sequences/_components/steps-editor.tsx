'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { BlockEditor } from '@/app/dashboard/broadcasts/_components/block-editor'
import { renderBlocks, type Block } from '@/lib/email-blocks'
import type { SequenceStep } from '@/lib/sequences'

const MAX_STEPS = 20
const fieldClass =
  'w-full rounded-md border border-line bg-canvas px-2.5 py-2 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const ctrlClass =
  'rounded-md border border-line bg-surface px-2 py-0.5 text-[13px] text-ink-3 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

function StepPreview({ blocks }: { blocks: Block[] }) {
  const html = useMemo(() => renderBlocks(blocks, { firstName: 'Alex' }), [blocks])
  return (
    <div>
      <div className="my-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Preview</div>
      {/* eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks */}
      <div className="rounded-lg border border-line bg-white p-3" dangerouslySetInnerHTML={{ __html: html }} />
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
    <div className="flex flex-col gap-3.5">
      {value.map((s, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center gap-2">
            <span className="flex-1 font-mono text-[11px] font-bold text-ink-3">STEP {i + 1}</span>
            <button type="button" className={ctrlClass} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className={ctrlClass} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className={ctrlClass} onClick={() => remove(i)} aria-label="Remove">✕</button>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-ink-3">
            Send
            <input type="number" min={0} className={cn(fieldClass, 'w-20')} value={s.offset_days} onChange={(e) => update(i, { offset_days: e.target.value === '' ? 0 : Number(e.target.value) })} />
            days after enrolling
          </label>
          <input className={fieldClass} placeholder="Email subject" value={s.subject} onChange={(e) => update(i, { subject: e.target.value })} />
          <BlockEditor value={s.body_blocks} onChange={(b) => update(i, { body_blocks: b })} />
          <StepPreview blocks={s.body_blocks} />
        </div>
      ))}
      <button type="button" className={ctrlClass} onClick={add} disabled={value.length >= MAX_STEPS}>+ Add step</button>
    </div>
  )
}
