'use client'

import { useState } from 'react'
import { toggleTemplate } from '../_actions/toggle-template'
import { deleteTemplate } from '../_actions/delete-template'
import { EditTemplateForm } from './edit-template-form'
import { Button } from '@/components/ui/button'

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
      <div className="flex items-center gap-2 justify-end">
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
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          Delete
        </Button>
      </div>

      {showEdit && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50,
        }}>
          <div style={{
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: 14,
            padding: '24px',
            width: 480,
            maxWidth: '90vw',
            boxShadow: 'var(--c-shadow-sm)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 18,
            }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>
                Edit class template
              </p>
              <Button variant="ghost" size="sm" onClick={() => setShowEdit(false)}>✕</Button>
            </div>
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
          </div>
        </div>
      )}
    </>
  )
}
