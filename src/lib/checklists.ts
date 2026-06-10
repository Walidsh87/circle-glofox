export const CHECKLIST_KINDS = ['onboarding', 'offboarding'] as const
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number]

export function validateChecklistItem(label: string): string | null {
  const l = label.trim()
  if (!l) return 'Please enter a step.'
  if (l.length > 200) return 'Step is too long (max 200 characters).'
  return null
}

export type ChecklistStep = { id: string; label: string; done: boolean }

export function mergeChecklist(items: { id: string; label: string }[], doneItemIds: Set<string>): { steps: ChecklistStep[]; total: number; done: number } {
  const steps = items.map((i) => ({ id: i.id, label: i.label, done: doneItemIds.has(i.id) }))
  return { steps, total: steps.length, done: steps.filter((s) => s.done).length }
}

export function countIncompleteOnboarding(memberDoneCounts: number[], total: number): number {
  if (total === 0) return 0
  return memberDoneCounts.filter((c) => c < total).length
}
