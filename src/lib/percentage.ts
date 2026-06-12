export type Zone = { label: string; pill: string; ink: string }

export function roundToBar(kg: number): number {
  return Math.round(kg / 2.5) * 2.5
}

export function kgToLb(kg: number): number {
  return Math.round(kg * 2.2046 * 10) / 10
}

export function getZone(pct: number): Zone {
  if (pct <= 65) return { label: 'Warm-up', pill: 'bg-ok-soft text-ok',         ink: 'text-ok' }
  if (pct <= 79) return { label: 'Work',    pill: 'bg-warn-soft text-warn',     ink: 'text-warn' }
  if (pct <= 94) return { label: 'Heavy',   pill: 'bg-danger-soft text-danger', ink: 'text-danger' }
  return                { label: 'Max',     pill: 'bg-accent-soft text-accent-ink', ink: 'text-accent-ink' }
}

export function loadForPercent(oneRmGrams: number, pct: number): { exactKg: number; barKg: number } {
  const exactKg = ((oneRmGrams / 1000) * pct) / 100
  return { exactKg, barKg: roundToBar(exactKg) }
}
