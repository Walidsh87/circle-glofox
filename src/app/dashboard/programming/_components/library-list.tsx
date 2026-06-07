'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTemplate } from '../_actions/delete-template'
import { TemplateForm, type TemplateExisting } from './template-form'

type Template = NonNullable<TemplateExisting>

const TYPE_LABEL: Record<string, string> = { time: 'For Time', rounds_reps: 'AMRAP r+r', load_kg: 'Max Load', amrap: 'AMRAP reps' }

export function LibraryList({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)

  function onDelete(id: string) {
    if (!confirm('Delete this template?')) return
    start(async () => {
      const res = await deleteTemplate(id)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }

  if (creating || editing) {
    return (
      <div style={{ maxWidth: 640 }}>
        <button type="button" onClick={() => { setCreating(false); setEditing(null) }} style={{ marginBottom: 14, background: 'none', border: 'none', color: 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 13 }}>← Back to library</button>
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px', boxShadow: 'var(--c-shadow-sm)' }}>
          <TemplateForm existing={editing} onSaved={() => { setCreating(false); setEditing(null); router.refresh() }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <button type="button" onClick={() => setCreating(true)} style={{ marginBottom: 16, height: 34, padding: '0 14px', background: 'var(--circle-lime)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--circle-ink)', cursor: 'pointer' }}>+ New template</button>

      {templates.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>No templates yet. Save a WOD from the calendar, or create one here.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '12px 16px', boxShadow: 'var(--c-shadow-sm)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{t.title}</div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginTop: 2 }}>
                  {TYPE_LABEL[t.scoring_type] ?? t.scoring_type}{t.strength_lift ? ' · + strength' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setEditing(t)} style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer' }}>Edit</button>
                <button type="button" disabled={pending} onClick={() => onDelete(t.id)} style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-danger)', cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
