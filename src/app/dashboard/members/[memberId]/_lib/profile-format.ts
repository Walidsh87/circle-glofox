// Display formatters shared by the member-profile read-only cards.

const LIFT_LABELS: Record<string, string> = {
  back_squat: 'Back Squat', front_squat: 'Front Squat', deadlift: 'Deadlift',
  clean: 'Clean', clean_and_jerk: 'Clean & Jerk', snatch: 'Snatch',
  overhead_squat: 'OHS', shoulder_press: 'Press', push_press: 'Push Press',
  thruster: 'Thruster', bench_press: 'Bench Press',
}

export function formatLiftName(name: string): string {
  return LIFT_LABELS[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatScore(value: number, scoringType: string): string {
  if (scoringType === 'time') {
    const m = Math.floor(value / 60)
    const s = Math.round(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (scoringType === 'load_kg') return `${value} kg`
  return `${value} reps`
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(iso))
}
