'use client'

import { useState } from 'react'
import { toggleTemplate } from '../_actions/toggle-template'
import { deleteTemplate } from '../_actions/delete-template'
import { EditTemplateForm } from './edit-template-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

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

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)} disabled={loading}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={handleToggle} disabled={loading}>
          {active ? 'Deactivate' : 'Activate'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={loading}
          className="text-danger hover:bg-danger-soft hover:text-danger"
        >
          Delete
        </Button>
      </div>

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
    </>
  )
}
