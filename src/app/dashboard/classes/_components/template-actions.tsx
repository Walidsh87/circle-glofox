'use client'

import { useRef, useState } from 'react'
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
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close and hand focus back to the trigger — otherwise focus falls to <body>
  // and a keyboard user restarts from the top of the page after every action.
  function closeMenu() {
    setMenuOpen(false)
    triggerRef.current?.focus()
  }

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
    // Escape lives on the wrapper so it also fires while focus is still on the
    // trigger (the popup opens without moving focus).
    <div className="relative flex justify-center" onKeyDown={(e) => { if (e.key === 'Escape' && menuOpen) closeMenu() }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        // A disclosure, deliberately NOT role="menu": the ARIA menu pattern
        // promises arrow-key roving focus we don't implement, and announcing a
        // contract the widget doesn't honor is worse than plain buttons — which
        // Tab reaches natively, in DOM order, right after the trigger.
        aria-haspopup="true"
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
          <div className="absolute right-0 top-8 z-50 w-40 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-pop">
            <button className={itemClass} disabled={loading} onClick={() => { closeMenu(); setShowEdit(true) }}>
              Edit
            </button>
            <button className={itemClass} disabled={loading} onClick={() => { closeMenu(); handleToggle() }}>
              {active ? 'Deactivate' : 'Activate'}
            </button>
            <button className={cn(itemClass, 'text-danger hover:bg-danger-soft hover:text-danger')} disabled={loading} onClick={() => { closeMenu(); handleDelete() }}>
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
