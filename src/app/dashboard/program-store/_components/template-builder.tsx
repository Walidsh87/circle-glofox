'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProgramBuilder } from '@/app/dashboard/members/[memberId]/_components/program-builder'
import { saveTemplate } from '@/app/dashboard/program-store/_actions/template'
import type { EditableProgram } from '@/app/dashboard/program/_lib/load-program'
import type { ProgramInput } from '@/lib/program'

export function TemplateBuilder({
  templateId: initialTemplateId,
  initial,
}: {
  templateId: string | null
  initial: EditableProgram | null
}) {
  const router = useRouter()
  // Track the templateId in state so a second Save after creating a new template
  // updates the same row instead of inserting a duplicate.
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId)

  async function handleSave(_programId: string | null, input: ProgramInput) {
    const res = await saveTemplate(templateId, input)
    if (!res.error && res.templateId) {
      setTemplateId(res.templateId)
    }
    return { error: res.error, templateId: res.templateId, programId: res.templateId }
  }

  return (
    <ProgramBuilder
      athleteId=""
      initial={initial}
      showWeek
      onSave={handleSave}
      onCancel={() => router.push('/dashboard/program-store')}
    />
  )
}
