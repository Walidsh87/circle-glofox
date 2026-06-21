'use client'

import { ProgramBuilder } from '@/app/dashboard/members/[memberId]/_components/program-builder'
import { saveTemplate } from '@/app/dashboard/program-store/_actions/template'
import type { EditableProgram } from '@/app/dashboard/program/_lib/load-program'
import type { ProgramInput } from '@/lib/program'

export function TemplateBuilder({
  templateId,
  initial,
}: {
  templateId: string | null
  initial: EditableProgram | null
}) {
  async function handleSave(programId: string | null, input: ProgramInput) {
    const res = await saveTemplate(programId ?? templateId, input)
    return { error: res.error, templateId: res.templateId, programId: res.templateId }
  }

  // athleteId is required by ProgramBuilder's cancel navigation but is unused in
  // the template flow (onSave overrides the save path; the cancel button is handled
  // by the parent page). Pass a placeholder so the prop is satisfied.
  return (
    <ProgramBuilder
      athleteId=""
      initial={initial}
      showWeek
      onSave={handleSave}
    />
  )
}
