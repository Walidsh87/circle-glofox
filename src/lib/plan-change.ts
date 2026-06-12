// #76 plan-change requests ride the follow_up_tasks system; the title is the
// contract between the athlete's request and the staff task list.

const PREFIX = 'Plan change: '

export function planChangeTitle(from: string, to: string): string {
  return `${PREFIX}${from} → ${to}`
}

/** Target plan name of the first open plan-change task, or null. */
export function pendingPlanChangeTo(titles: string[]): string | null {
  for (const t of titles) {
    if (!t.startsWith(PREFIX)) continue
    const idx = t.lastIndexOf(' → ')
    if (idx === -1) continue
    return t.slice(idx + 3).trim()
  }
  return null
}
