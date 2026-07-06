'use client'

import { useState } from 'react'
import { toggleTemplate } from '../_actions/toggle-template'
import { deleteTemplate } from '../_actions/delete-template'
import { EditTemplateForm } from './edit-template-form'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Coach = { id: string; full_name: string }

export function TemplateActions({
  templateId,
  active,
  name,
  weekday,
  startTime,
  capacity,
  coachId,
  coaches,
}: {
  templateId: string
  active: boolean
  name: string
  weekday: number
  startTime: string
  capacity: number
  coachId: string | null
  coaches: Coach[]
}) {
  const [loading, setLoading] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleToggle() {
    setLoading(true)
    const { error } = await toggleTemplate(templateId, !active)
    if (error) alert(error)
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    setLoading(true)
    const { error } = await deleteTemplate(templateId)
    if (error) alert(error)
    setLoading(false)
  }

  const itemClass =
    'block w-full px-3 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50'

  return (
    <div className="relative flex justify-center">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Actions for ${name}`}
        className="grid h-7 w-7 place-items-center rounded-md text-[16px] leading-none text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}
            className="absolute right-0 top-8 z-50 w-40 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-pop"
          >
            <button role="menuitem" className={itemClass} disabled={loading} onClick={() => { setMenuOpen(false); setShowEdit(true) }}>
              Edit
            </button>
            <button role="menuitem" className={itemClass} disabled={loading} onClick={() => { setMenuOpen(false); handleToggle() }}>
              {active ? 'Deactivate' : 'Activate'}
            </button>
            <button role="menuitem" className={cn(itemClass, 'text-danger hover:bg-danger-soft hover:text-danger')} disabled={loading} onClick={() => { setMenuOpen(false); handleDelete() }}>
              Delete
            </button>
          </div>
        </>
      )}

      <Dialog open={showEdit} onClose={() => setShowEdit(false)} title="Edit class template" className="max-w-lg">
        <EditTemplateForm
          templateId={templateId}
          defaultName={name}
          defaultWeekday={weekday}
          defaultStartTime={startTime}
          defaultCapacity={capacity}
          defaultCoachId={coachId}
          coaches={coaches}
          onSuccess={() => setShowEdit(false)}
        />
      </Dialog>
    </div>
  )
}
