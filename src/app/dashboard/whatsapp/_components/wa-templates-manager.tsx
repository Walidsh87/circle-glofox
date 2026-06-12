'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { saveWaTemplate } from '../_actions/save-wa-template'
import { deleteWaTemplate } from '../_actions/delete-wa-template'

export type WaTemplate = { id: string; name: string; content_sid: string; body_preview: string; var_count: number }

const inputClass =
  'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function WaTemplatesManager({ templates }: { templates: WaTemplate[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [contentSid, setContentSid] = useState('')
  const [bodyPreview, setBodyPreview] = useState('')
  const [varCount, setVarCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

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
    <Card className="mb-6 flex flex-col gap-3 p-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">Templates</h2>
      {templates.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink">{t.name} <span className="font-mono text-[11px] font-normal text-ink-3">· {t.var_count} var{t.var_count === 1 ? '' : 's'}</span></div>
                <div className="truncate text-xs text-ink-3">{t.body_preview}</div>
              </div>
              <button
                onClick={() => onDelete(t.id)}
                disabled={pending}
                className="rounded-md border border-line bg-transparent px-2.5 py-1 text-xs text-danger transition-colors hover:border-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-ink-3">Create and approve templates in the Twilio console, then paste the Content SID here.</p>
      <input className={inputClass} placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={inputClass} placeholder="Content SID (HX…)" value={contentSid} onChange={(e) => setContentSid(e.target.value)} />
      <textarea className={cn(inputClass, 'min-h-[70px] resize-y')} placeholder="Approved body, e.g. Hi {{1}}, your trial ends {{2}}." value={bodyPreview} onChange={(e) => setBodyPreview(e.target.value)} />
      <div className="flex items-center gap-2.5">
        <label className="text-[13px] text-ink-3">Variables</label>
        <input type="number" min={0} max={5} className={cn(inputClass, 'w-20')} value={varCount} onChange={(e) => setVarCount(Number(e.target.value))} />
      </div>
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      <Button size="sm" onClick={onAdd} disabled={pending || !name.trim() || !contentSid.trim()} className="self-start">
        Add template
      </Button>
    </Card>
  )
}
