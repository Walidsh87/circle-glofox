'use client'

import { useState } from 'react'
import { toggleTemplate } from '../_actions/toggle-template'
import { deleteTemplate } from '../_actions/delete-template'
import { Button } from '@/components/ui/button'

export function TemplateActions({
  templateId,
  active,
  name,
}: {
  templateId: string
  active: boolean
  name: string
}) {
  const [loading, setLoading] = useState(false)

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
    <div className="flex items-center gap-2 justify-end">
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
  )
}
