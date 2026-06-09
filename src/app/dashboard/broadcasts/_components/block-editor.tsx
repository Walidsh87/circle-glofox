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

const fieldStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-bg)', fontSize: 13.5, color: 'var(--c-ink)' } as const
const ctrlBtn = { padding: '2px 8px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 13 } as const

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {value.map((b, i) => (
        <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 10, padding: 12, background: 'var(--c-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-ink-muted)', flex: 1 }}>{b.type}</span>
            <button type="button" style={ctrlBtn} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" style={ctrlBtn} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" style={ctrlBtn} onClick={() => remove(i)} aria-label="Remove">✕</button>
          </div>
          {(b.type === 'heading' || b.type === 'paragraph') && (
            <input style={fieldStyle} placeholder="Text (use {{first_name}} to personalise)" value={b.text} onChange={(e) => update(i, { text: e.target.value })} />
          )}
          {b.type === 'image' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input style={fieldStyle} placeholder="Image URL (https://…)" value={b.url} onChange={(e) => update(i, { url: e.target.value })} />
              <input style={fieldStyle} placeholder="Alt text" value={b.alt} onChange={(e) => update(i, { alt: e.target.value })} />
            </div>
          )}
          {b.type === 'button' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input style={fieldStyle} placeholder="Button label" value={b.label} onChange={(e) => update(i, { label: e.target.value })} />
              <input style={fieldStyle} placeholder="Link URL (https://…)" value={b.url} onChange={(e) => update(i, { url: e.target.value })} />
            </div>
          )}
          {b.type === 'divider' && <div style={{ borderTop: '1px solid var(--c-border)', margin: '4px 0' }} />}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ADDABLE.map((a) => (
          <button key={a.type} type="button" style={ctrlBtn} onClick={() => add(a.type)} disabled={value.length >= MAX_BLOCKS}>{a.label}</button>
        ))}
      </div>
    </div>
  )
}
