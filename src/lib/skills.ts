export const BELTS = ['white', 'yellow', 'orange', 'green', 'blue', 'purple', 'brown', 'black'] as const
export type Belt = (typeof BELTS)[number]

export const BELT_COLOR: Record<Belt, string> = {
  white: '#e5e7eb', yellow: '#facc15', orange: '#fb923c', green: '#4ade80',
  blue: '#60a5fa', purple: '#a78bfa', brown: '#a16207', black: '#1f2937',
}

export const SKILLS: { key: string; label: string; category: string }[] = [
  { key: 'pullup',       label: 'Pull-up',           category: 'Gymnastics' },
  { key: 'toes_to_bar',  label: 'Toes-to-bar',       category: 'Gymnastics' },
  { key: 'double_under', label: 'Double-under',      category: 'Gymnastics' },
  { key: 'handstand_pu', label: 'Handstand push-up', category: 'Gymnastics' },
  { key: 'muscle_up',    label: 'Muscle-up',         category: 'Gymnastics' },
  { key: 'snatch',         label: 'Snatch',         category: 'Weightlifting' },
  { key: 'clean_jerk',     label: 'Clean & Jerk',   category: 'Weightlifting' },
  { key: 'overhead_squat', label: 'Overhead Squat', category: 'Weightlifting' },
  { key: 'back_squat',     label: 'Back Squat',     category: 'Weightlifting' },
  { key: 'deadlift',       label: 'Deadlift',       category: 'Weightlifting' },
  { key: 'row',  label: 'Row',  category: 'Engine' },
  { key: 'run',  label: 'Run',  category: 'Engine' },
  { key: 'bike', label: 'Bike', category: 'Engine' },
]

export const SKILL_KEYS = new Set(SKILLS.map((s) => s.key))

// Index in BELTS (lower = lower belt); -1 if unknown.
export function beltRank(belt: string): number {
  return (BELTS as readonly string[]).indexOf(belt)
}

// Lowest assessed belt across the {skill_key: belt} map; null if none valid.
export function overallBelt(levels: Record<string, string>): Belt | null {
  let best: Belt | null = null
  for (const belt of Object.values(levels)) {
    const r = beltRank(belt)
    if (r < 0) continue
    if (best === null || r < beltRank(best)) best = belt as Belt
  }
  return best
}
