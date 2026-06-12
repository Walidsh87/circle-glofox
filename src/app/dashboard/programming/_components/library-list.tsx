'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
      <div className="max-w-2xl">
        <button
          type="button"
          onClick={() => { setCreating(false); setEditing(null) }}
          className="mb-3.5 text-[13px] text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ← Back to library
        </button>
        <Card className="p-5">
          <TemplateForm key={editing?.id ?? 'new'} existing={editing} onSaved={() => { setCreating(false); setEditing(null); router.refresh() }} />
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <Button size="sm" className="mb-4" type="button" onClick={() => setCreating(true)}>
        + New template
      </Button>

      {templates.length === 0 ? (
        <p className="text-[13px] text-ink-3">No templates yet. Save a WOD from the calendar, or create one here.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <Card key={t.id} className="flex items-center justify-between gap-2.5 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-ink">{t.title}</div>
                <div className="mt-0.5 font-mono text-[11.5px] text-ink-3">
                  {TYPE_LABEL[t.scoring_type] ?? t.scoring_type}{t.strength_lift ? ' · + strength' : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditing(t)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-danger hover:border-danger"
                  disabled={pending}
                  onClick={() => onDelete(t.id)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
