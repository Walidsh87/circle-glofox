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
    <div className="mb-7">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.04em] text-ink-3">Templates</h2>
      <div className="flex flex-col gap-1.5">
        {templates.map((t) => (
          <div key={t.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2">
            <span className="flex-1 text-[13.5px] text-ink">{t.name}</span>
            <button
              onClick={() => onDelete(t.id)}
              disabled={pending}
              className="rounded-md border border-line px-2.5 py-1 text-xs text-danger transition-colors hover:border-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
