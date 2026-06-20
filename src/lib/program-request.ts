// "Request a program" rides the follow_up_tasks system (mirrors #76 plan-change).
// The title is the contract between the athlete's request and the staff queue.
// A DISTINCT prefix keeps it from colliding with plan-change tasks.

const PREFIX = 'Program request: '

export const PROGRAM_FOCUSES = ['Strength', 'Speed / conditioning', 'Weight gain', 'Weight loss', 'General fitness'] as const
export type ProgramFocus = (typeof PROGRAM_FOCUSES)[number]

export function programRequestTitle(focus: string): string {
  return `${PREFIX}${focus}`
}

/** Focus of the first open program-request task, or null. */
export function pendingProgramRequest(titles: string[]): string | null {
  for (const t of titles) {
    if (t.startsWith(PREFIX)) return t.slice(PREFIX.length).trim()
  }
  return null
}

export function isValidFocus(focus: string): boolean {
  return (PROGRAM_FOCUSES as readonly string[]).includes(focus)
}
