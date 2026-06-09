export type Proration = {
  creditAed: number   // unused old plan, refunded
  chargeAed: number   // remaining new plan
  netAed: number      // chargeAed - creditAed (positive = member owes; negative = credit)
  unusedDays: number
  cycleDays: number
}

const round2 = (x: number) => Math.round(x * 100) / 100
const dayNum = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000)

// Current cycle ends one calendar month after the anchor (matches getDueDate).
function dueDateOf(anchor: string): string {
  const d = new Date(anchor + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

// Daily proration over the current cycle [anchor, dueDate).
export function computeProration(
  oldMonthly: number,
  newMonthly: number,
  anchor: string,
  changeDate: string,
): Proration {
  const cycleDays = dayNum(dueDateOf(anchor)) - dayNum(anchor)
  if (cycleDays <= 0) return { creditAed: 0, chargeAed: 0, netAed: 0, unusedDays: 0, cycleDays: Math.max(0, cycleDays) }
  const unusedDays = Math.max(0, Math.min(dayNum(dueDateOf(anchor)) - dayNum(changeDate), cycleDays))
  const fraction = unusedDays / cycleDays
  const creditAed = round2(oldMonthly * fraction)
  const chargeAed = round2(newMonthly * fraction)
  return { creditAed, chargeAed, netAed: round2(chargeAed - creditAed), unusedDays, cycleDays }
}
