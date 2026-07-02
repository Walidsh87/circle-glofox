// Skill bests (#36 rework): self-logged numeric bests replace the belt system.
// Pure catalog + parsing/format/derivation helpers — no DB access. Stored `value`
// is an integer whose unit depends on the skill's measure:
//   reps → count · weight → grams · distance_m → meters · time → seconds.
// Current best per skill = MAX of the logged values (MIN for time — lower is better),
// derived at read time from the append-only athlete_skill_bests log (mig 094).

export type Measure = 'reps' | 'weight' | 'distance_m' | 'time'

export type SkillBestDef = {
  key: string
  label: string
  category: 'Gymnastics' | 'Engine'
  measure: Measure
}

export const SKILL_BESTS: SkillBestDef[] = [
  { key: 'pullup',          label: 'Pull-up',            category: 'Gymnastics', measure: 'reps' },
  { key: 'toes_to_bar',     label: 'Toes-to-bar',        category: 'Gymnastics', measure: 'reps' },
  { key: 'double_under',    label: 'Double-under',       category: 'Gymnastics', measure: 'reps' },
  { key: 'handstand_pu',    label: 'Handstand push-up',  category: 'Gymnastics', measure: 'reps' },
  { key: 'ring_muscle_up',  label: 'Ring muscle-up',     category: 'Gymnastics', measure: 'reps' },
  { key: 'bar_muscle_up',   label: 'Bar muscle-up',      category: 'Gymnastics', measure: 'reps' },
  { key: 'dip',             label: 'Dip',                category: 'Gymnastics', measure: 'reps' },
  { key: 'weighted_pullup', label: 'Weighted pull-up',   category: 'Gymnastics', measure: 'weight' },
  { key: 'weighted_dip',    label: 'Weighted dip',       category: 'Gymnastics', measure: 'weight' },
  { key: 'handstand_walk',  label: 'Handstand walk',     category: 'Gymnastics', measure: 'distance_m' },
  { key: 'row_500',         label: 'Row 500m',           category: 'Engine',     measure: 'time' },
  { key: 'row_1k',          label: 'Row 1K',             category: 'Engine',     measure: 'time' },
  { key: 'row_2k',          label: 'Row 2K',             category: 'Engine',     measure: 'time' },
  { key: 'row_5k',          label: 'Row 5K',             category: 'Engine',     measure: 'time' },
  { key: 'run_400',         label: 'Run 400m',           category: 'Engine',     measure: 'time' },
  { key: 'run_1k',          label: 'Run 1K',             category: 'Engine',     measure: 'time' },
  { key: 'run_2k',          label: 'Run 2K',             category: 'Engine',     measure: 'time' },
  { key: 'run_5k',          label: 'Run 5K',             category: 'Engine',     measure: 'time' },
  { key: 'bike_1k',         label: 'Bike 1K',            category: 'Engine',     measure: 'time' },
  { key: 'bike_2k',         label: 'Bike 2K',            category: 'Engine',     measure: 'time' },
  { key: 'bike_5k',         label: 'Bike 5K',            category: 'Engine',     measure: 'time' },
  { key: 'bike_10k',        label: 'Bike 10K',           category: 'Engine',     measure: 'time' },
]

export const SKILL_BEST_CATEGORIES = ['Gymnastics', 'Engine'] as const

// Stored-unit ranges (reps · grams · meters · seconds) + which direction "better" points.
export const MEASURES: Record<Measure, { unit: string; direction: 'higher' | 'lower'; min: number; max: number }> = {
  reps:       { unit: 'reps', direction: 'higher', min: 1, max: 1000 },
  weight:     { unit: 'kg',   direction: 'higher', min: 100, max: 300000 }, // grams (0.1–300 kg)
  distance_m: { unit: 'm',    direction: 'higher', min: 1, max: 1000 },
  time:       { unit: 'time', direction: 'lower',  min: 1, max: 7200 },   // seconds (2 h)
}

const BY_KEY = new Map(SKILL_BESTS.map((s) => [s.key, s]))

export function skillByKey(key: string): SkillBestDef | undefined {
  return BY_KEY.get(key)
}

/** grams → kg display: "150", "142.5" (one decimal, trailing zero trimmed). */
function gramsToKg(grams: number): string {
  return String(Math.round(grams / 100) / 10)
}

/** seconds → "m:ss", or "h:mm:ss" from one hour up. */
function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Stored value → display string in the skill's measure ('12', '12.5 kg', '15 m', '7:45'). */
export function formatBestValue(key: string, value: number): string {
  switch (skillByKey(key)?.measure) {
    case 'weight':     return `${gramsToKg(value)} kg`
    case 'distance_m': return `${value} m`
    case 'time':       return formatSeconds(value)
    case 'reps':
    default:           return String(value)
  }
}

/**
 * 'mm:ss' / 'h:mm:ss' / bare seconds → total seconds, or null when unparseable.
 * Sub-minute parts must be two digits ≤ 59 ('7:45' ✓, '7:5' ✗, '7:99' ✗).
 */
export function parseTimeToSeconds(raw: string): number | null {
  const parts = raw.trim().split(':')
  if (parts.length < 1 || parts.length > 3) return null
  if (!/^\d+$/.test(parts[0])) return null
  if (parts.length === 1) return parseInt(parts[0], 10)
  const rest = parts.slice(1)
  if (rest.some((p) => !/^\d{2}$/.test(p) || parseInt(p, 10) > 59)) return null
  return parts.reduce((total, p) => total * 60 + parseInt(p, 10), 0)
}

/**
 * Raw form input → stored integer for the skill's measure (reps/meters pass through,
 * kg → grams, mm:ss → seconds). Null when the key is unknown or the value unparseable.
 */
export function toStoredValue(key: string, rawValue: string): number | null {
  const skill = skillByKey(key)
  if (!skill) return null
  const raw = rawValue.trim()
  switch (skill.measure) {
    case 'weight': {
      if (!/^\d+(\.\d+)?$/.test(raw)) return null
      return Math.round(parseFloat(raw) * 1000)
    }
    case 'time':
      return parseTimeToSeconds(raw)
    case 'reps':
    case 'distance_m':
    default:
      return /^\d+$/.test(raw) ? parseInt(raw, 10) : null
  }
}

const PARSE_MESSAGES: Record<Measure, string> = {
  reps: 'Enter a whole number of reps.',
  weight: 'Enter a weight in kg.',
  distance_m: 'Enter a whole number of meters.',
  time: 'Enter a time as mm:ss.',
}

const RANGE_MESSAGES: Record<Measure, string> = {
  reps: 'Enter between 1 and 1000 reps.',
  weight: 'Enter a weight between 0.1 and 300 kg.',
  distance_m: 'Enter between 1 and 1000 meters.',
  time: 'Enter a time between 0:01 and 2:00:00.',
}

/** Returns a human error message, or null when the raw input is valid for the skill. */
export function validateBestInput(key: string, rawValue: string): string | null {
  const skill = skillByKey(key)
  if (!skill) return 'Pick a skill from the list.'
  const stored = toStoredValue(key, rawValue)
  if (stored === null) return PARSE_MESSAGES[skill.measure]
  const { min, max } = MEASURES[skill.measure]
  if (stored < min || stored > max) return RANGE_MESSAGES[skill.measure]
  return null
}

/**
 * Append-only log rows → the current best per skill key (MAX, or MIN for time).
 * Rows with keys no longer in the catalog are ignored.
 */
export function currentBests(rows: { skill_key: string; value: number }[]): Record<string, number> {
  const bests: Record<string, number> = {}
  for (const row of rows) {
    const skill = skillByKey(row.skill_key)
    if (!skill) continue
    const prev = bests[row.skill_key]
    if (prev === undefined) {
      bests[row.skill_key] = row.value
    } else {
      bests[row.skill_key] = MEASURES[skill.measure].direction === 'lower' ? Math.min(prev, row.value) : Math.max(prev, row.value)
    }
  }
  return bests
}
