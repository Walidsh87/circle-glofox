export type PerfInstance = {
  id: string
  starts_at: string
  template_id: string
  template_name: string
  capacity: number
  coach_id: string | null
}

export type PerfBooking = {
  class_instance_id: string
  checked_in: boolean
}

export type TemplateRow = {
  name: string
  coachName: string
  classesHeld: number
  totalCheckIns: number
  avgFillPct: number
  noShowPct: number
}

export type CoachRow = {
  coachName: string
  classesHeld: number
  totalCheckIns: number
  avgFillPct: number
  noShowPct: number
}

export type ClassPerformance = { byTemplate: TemplateRow[]; byCoach: CoachRow[] }

type Agg = { classesHeld: number; booked: number; attended: number; fillPctSum: number }

function newAgg(): Agg {
  return { classesHeld: 0, booked: 0, attended: 0, fillPctSum: 0 }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

function metrics(a: Agg): { classesHeld: number; totalCheckIns: number; avgFillPct: number; noShowPct: number } {
  return {
    classesHeld: a.classesHeld,
    totalCheckIns: a.attended,
    avgFillPct: a.classesHeld > 0 ? round1(a.fillPctSum / a.classesHeld) : 0,
    noShowPct: a.booked > 0 ? round1((1 - a.attended / a.booked) * 100) : 0,
  }
}

/** Fill/no-show per class template and per coach over past instances (starts_at <= nowIso). */
export function buildClassPerformance(
  instances: PerfInstance[],
  bookings: PerfBooking[],
  coachNameById: Map<string, string>,
  nowIso: string,
): ClassPerformance {
  const countsByInstance = new Map<string, { booked: number; attended: number }>()
  for (const b of bookings) {
    let c = countsByInstance.get(b.class_instance_id)
    if (!c) { c = { booked: 0, attended: 0 }; countsByInstance.set(b.class_instance_id, c) }
    c.booked++
    if (b.checked_in) c.attended++
  }

  const byTemplateAgg = new Map<string, Agg & { name: string; coachName: string }>()
  const byCoachAgg = new Map<string, Agg>()

  for (const inst of instances) {
    if (inst.starts_at > nowIso) continue // future instance — not held yet
    const counts = countsByInstance.get(inst.id) ?? { booked: 0, attended: 0 }
    const fillPct = inst.capacity > 0 ? (counts.attended / inst.capacity) * 100 : 0
    const coachName = (inst.coach_id !== null ? coachNameById.get(inst.coach_id) : undefined) ?? 'Unassigned'

    let t = byTemplateAgg.get(inst.template_id)
    if (!t) { t = { ...newAgg(), name: inst.template_name, coachName }; byTemplateAgg.set(inst.template_id, t) }
    t.classesHeld++; t.booked += counts.booked; t.attended += counts.attended; t.fillPctSum += fillPct

    let c = byCoachAgg.get(coachName)
    if (!c) { c = newAgg(); byCoachAgg.set(coachName, c) }
    c.classesHeld++; c.booked += counts.booked; c.attended += counts.attended; c.fillPctSum += fillPct
  }

  const byTemplate: TemplateRow[] = [...byTemplateAgg.values()]
    .map((a) => ({ name: a.name, coachName: a.coachName, ...metrics(a) }))
    .sort((a, b) => b.avgFillPct - a.avgFillPct)

  const byCoach: CoachRow[] = [...byCoachAgg.entries()]
    .map(([coachName, a]) => ({ coachName, ...metrics(a) }))
    .sort((a, b) => b.classesHeld - a.classesHeld)

  return { byTemplate, byCoach }
}
