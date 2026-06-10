'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveWaTemplate } from '../_actions/save-wa-template'
import { deleteWaTemplate } from '../_actions/delete-wa-template'

export type WaTemplate = { id: string; name: string; content_sid: string; body_preview: string; var_count: number }

export function WaTemplatesManager({ templates }: { templates: WaTemplate[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [contentSid, setContentSid] = useState('')
  const [bodyPreview, setBodyPreview] = useState('')
  const [varCount, setVarCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)' } as const

  function onAdd() {
    setError(null)
    start(async () => {
      const res = await saveWaTemplate({ name, contentSid, bodyPreview, varCount })
      if (res.error) { setError(res.error); return }
      setName(''); setContentSid(''); setBodyPreview(''); setVarCount(0)
      router.refresh()
    })
  }
  function onDelete(id: string) {
    if (!confirm('Delete this template?')) return
    start(async () => { await deleteWaTemplate(id); router.refresh() })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 24 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Templates</h2>
      {templates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{t.name} <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>· {t.var_count} var{t.var_count === 1 ? '' : 's'}</span></div>
                <div style={{ fontSize: 12, color: 'var(--c-ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body_preview}</div>
              </div>
              <button onClick={() => onDelete(t.id)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 12.5 }}>Delete</button>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Create and approve templates in the Twilio console, then paste the Content SID here.</p>
      <input style={inputStyle} placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
      <input style={inputStyle} placeholder="Content SID (HX…)" value={contentSid} onChange={(e) => setContentSid(e.target.value)} />
      <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Approved body, e.g. Hi {{1}}, your trial ends {{2}}." value={bodyPreview} onChange={(e) => setBodyPreview(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>Variables</label>
        <input type="number" min={0} max={5} style={{ ...inputStyle, width: 80 }} value={varCount} onChange={(e) => setVarCount(Number(e.target.value))} />
      </div>
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}
      <button onClick={onAdd} disabled={pending || !name.trim() || !contentSid.trim()} style={{ alignSelf: 'flex-start', padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>Add template</button>
    </div>
  )
}
