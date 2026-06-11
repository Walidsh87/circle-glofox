export type AttendanceInstance = {
  id: string
  starts_at: string
  templateName: string
  capacity: number
}

export type AttendanceBooking = {
  class_instance_id: string
  checked_in: boolean
}

export type TemplateAttendanceRow = {
  name: string
  classesHeld: number
  avgAttended: number
  fillPct: number
  noShowPct: number
}

export type AttendanceReport = {
  summary: {
    totalCheckIns: number
    classesHeld: number
    avgAttendedPerClass: number
    noShowRate: number
  }
  byTemplate: TemplateAttendanceRow[]
  busiest: TemplateAttendanceRow[]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function buildAttendanceReport(
  instances: AttendanceInstance[],
  bookings: AttendanceBooking[],
  nowIso: string,
  timeZone: string,
): AttendanceReport {
  void timeZone // part of the #50 lib signature; this report has no per-day bucketing, so the zone is unused

  const nowMs = Date.parse(nowIso)
  const held = instances.filter((i) => Date.parse(i.starts_at) <= nowMs)
  const heldIds = new Set(held.map((i) => i.id))

  let booked = 0
  let attended = 0
  const perInstance = new Map<string, { booked: number; attended: number }>()
  for (const b of bookings) {
    if (!heldIds.has(b.class_instance_id)) continue
    booked += 1
    if (b.checked_in) attended += 1
    const agg = perInstance.get(b.class_instance_id) ?? { booked: 0, attended: 0 }
    agg.booked += 1
    if (b.checked_in) agg.attended += 1
    perInstance.set(b.class_instance_id, agg)
  }

  type Group = { name: string; classesHeld: number; capacity: number; booked: number; attended: number }
  const groups = new Map<string, Group>()
  for (const i of held) {
    const g = groups.get(i.templateName) ?? { name: i.templateName, classesHeld: 0, capacity: 0, booked: 0, attended: 0 }
    g.classesHeld += 1
    g.capacity = Math.max(g.capacity, i.capacity)
    const agg = perInstance.get(i.id)
    if (agg) {
      g.booked += agg.booked
      g.attended += agg.attended
    }
    groups.set(i.templateName, g)
  }

  const byTemplate: TemplateAttendanceRow[] = [...groups.values()]
    .map((g) => {
      const avg = g.attended / g.classesHeld
      return {
        name: g.name,
        classesHeld: g.classesHeld,
        avgAttended: round1(avg),
        fillPct: g.capacity > 0 ? round1((avg / g.capacity) * 100) : 0,
        noShowPct: g.booked > 0 ? round1(((g.booked - g.attended) / g.booked) * 100) : 0,
      }
    })
    .sort((a, b) => b.avgAttended - a.avgAttended || a.name.localeCompare(b.name))

  return {
    summary: {
      totalCheckIns: attended,
      classesHeld: held.length,
      avgAttendedPerClass: held.length > 0 ? round1(attended / held.length) : 0,
      noShowRate: booked > 0 ? round1(((booked - attended) / booked) * 100) : 0,
    },
    byTemplate,
    busiest: byTemplate.slice(0, 5),
  }
}
