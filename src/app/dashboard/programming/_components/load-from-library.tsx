'use client'

import { useRouter } from 'next/navigation'

type Template = { id: string; title: string }

export function LoadFromLibrary({ date, templates }: { date: string; templates: Template[] }) {
  const router = useRouter()
  if (templates.length === 0) return null
  return (
    <select
      defaultValue=""
      onChange={(e) => { if (e.target.value) router.push(`/dashboard/programming/day/${date}?template=${e.target.value}`) }}
      className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <option value="">Load from library…</option>
      {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
    </select>
  )
}
