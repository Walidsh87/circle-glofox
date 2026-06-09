import type { TriggerType } from '@/lib/automations'

export const TRIGGER_OPTIONS: { type: TriggerType; label: string; usesDays: boolean }[] = [
  { type: 'no_checkin', label: 'No check-in for N days', usesDays: true },
  { type: 'trial_ending', label: 'Trial ending in N days', usesDays: true },
  { type: 'joined', label: 'N days after joining', usesDays: true },
  { type: 'birthday', label: 'On birthday', usesDays: false },
]

export function triggerLabel(type: TriggerType, days: number | null): string {
  switch (type) {
    case 'no_checkin': return `No check-in for ${days} days`
    case 'trial_ending': return `Trial ending in ${days} days`
    case 'joined': return `${days} days after joining`
    case 'birthday': return 'On birthday'
  }
}
