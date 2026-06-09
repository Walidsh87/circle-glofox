'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTemplate } from '../_actions/delete-template'

export function TemplatesManager({ templates }: { templates: { id: string; name: string }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (templates.length === 0) return null

  function onDelete(id: string) {
    if (!confirm('Delete this template?')) return
    start(async () => { await deleteTemplate(id); router.refresh() })
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Templates</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {templates.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <span style={{ flex: 1, fontSize: 13.5, color: 'var(--c-ink)' }}>{t.name}</span>
            <button onClick={() => onDelete(t.id)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 12.5 }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
