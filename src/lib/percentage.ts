export type Zone = { label: string; bg: string; ink: string }

export function roundToBar(kg: number): number {
  return Math.round(kg / 2.5) * 2.5
}

export function kgToLb(kg: number): number {
  return Math.round(kg * 2.2046 * 10) / 10
}

export function getZone(pct: number): Zone {
  if (pct <= 65) return { label: 'Warm-up', bg: 'var(--c-ok-soft)',       ink: 'var(--c-ok-ink)' }
  if (pct <= 79) return { label: 'Work',    bg: 'var(--c-warn-soft)',     ink: 'var(--c-warn-ink)' }
  if (pct <= 94) return { label: 'Heavy',   bg: 'var(--c-danger-soft)',   ink: 'var(--c-danger-ink)' }
  return                { label: 'Max',     bg: 'var(--circle-lime-soft)', ink: 'var(--circle-lime-ink)' }
}

export function loadForPercent(oneRmGrams: number, pct: number): { exactKg: number; barKg: number } {
  const exactKg = ((oneRmGrams / 1000) * pct) / 100
  return { exactKg, barKg: roundToBar(exactKg) }
}
