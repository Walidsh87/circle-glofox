export type HelpArea = 'setup' | 'money' | 'classes' | 'growth'
export const AREA_ORDER: HelpArea[] = ['setup', 'money', 'classes', 'growth']
export const AREA_LABELS: Record<HelpArea, string> = {
  setup: 'Setup & operations', money: 'Memberships & money',
  classes: 'Classes & programming', growth: 'Growth & integrations',
}
export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'code'; text: string }
  | { type: 'note'; text: string }
  | { type: 'link'; label: string; href: string }
export type HelpGuide = { slug: string; area: HelpArea; title: string; summary: string; blocks: HelpBlock[] }
