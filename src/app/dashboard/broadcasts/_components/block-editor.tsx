'use client'

import { type Block, MAX_BLOCKS } from '@/lib/email-blocks'

const ADDABLE: { type: Block['type']; label: string }[] = [
  { type: 'heading', label: '+ Heading' },
  { type: 'paragraph', label: '+ Text' },
  { type: 'image', label: '+ Image' },
  { type: 'button', label: '+ Button' },
  { type: 'divider', label: '+ Divider' },
]

function emptyBlock(type: Block['type']): Block {
  switch (type) {
    case 'heading': return { type: 'heading', text: '' }
    case 'paragraph': return { type: 'paragraph', text: '' }
    case 'image': return { type: 'image', url: '', alt: '' }
    case 'button': return { type: 'button', label: '', url: '' }
    case 'divider': return { type: 'divider' }
  }
}

const fieldClass =
  'w-full rounded-md border border-line bg-canvas px-2.5 py-2 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const ctrlBtnClass =
  'rounded-md border border-line bg-surface px-2 py-0.5 text-[13px] text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

export function BlockEditor({ value, onChange }: { value: Block[]; onChange: (b: Block[]) => void }) {
  function update(i: number, patch: Partial<Block>) {
    onChange(value.map((b, j) => (j === i ? ({ ...b, ...patch } as Block) : b)))
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = value.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function remove(i: number) { onChange(value.filter((_, j) => j !== i)) }
  function add(type: Block['type']) { if (value.length < MAX_BLOCKS) onChange([...value, emptyBlock(type)]) }

  return (
    <div className="flex flex-col gap-2.5">
      {value.map((b, i) => (
        <div key={i} className="rounded-[10px] border border-line bg-canvas p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex-1 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">{b.type}</span>
            <button type="button" className={ctrlBtnClass} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className={ctrlBtnClass} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className={ctrlBtnClass} onClick={() => remove(i)} aria-label="Remove">✕</button>
          </div>
          {(b.type === 'heading' || b.type === 'paragraph') && (
            <input className={fieldClass} placeholder="Text (use {{first_name}} to personalise)" value={b.text} onChange={(e) => update(i, { text: e.target.value })} />
          )}
          {b.type === 'image' && (
            <div className="flex flex-col gap-1.5">
              <input className={fieldClass} placeholder="Image URL (https://…)" value={b.url} onChange={(e) => update(i, { url: e.target.value })} />
              <input className={fieldClass} placeholder="Alt text" value={b.alt} onChange={(e) => update(i, { alt: e.target.value })} />
            </div>
          )}
          {b.type === 'button' && (
            <div className="flex flex-col gap-1.5">
              <input className={fieldClass} placeholder="Button label" value={b.label} onChange={(e) => update(i, { label: e.target.value })} />
              <input className={fieldClass} placeholder="Link URL (https://…)" value={b.url} onChange={(e) => update(i, { url: e.target.value })} />
            </div>
          )}
          {b.type === 'divider' && <div className="my-1 border-t border-line" />}
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {ADDABLE.map((a) => (
          <button key={a.type} type="button" className={ctrlBtnClass} onClick={() => add(a.type)} disabled={value.length >= MAX_BLOCKS}>{a.label}</button>
        ))}
      </div>
    </div>
  )
}
