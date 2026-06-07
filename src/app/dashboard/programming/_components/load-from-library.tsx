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
      style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 13, color: 'var(--c-ink)', fontFamily: 'inherit' }}
    >
      <option value="">Load from library…</option>
      {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
    </select>
  )
}
