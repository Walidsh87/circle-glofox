import type { HelpGuide, HelpArea } from './types'
import { AREA_ORDER } from './types'
import { overview } from './guides/overview'

export const HELP_GUIDES: HelpGuide[] = [overview]

export function findGuide(slug: string | undefined): HelpGuide | null {
  if (slug) { const g = HELP_GUIDES.find((x) => x.slug === slug); if (g) return g }
  return HELP_GUIDES[0] ?? null
}
export function guidesByArea(): { area: HelpArea; guides: HelpGuide[] }[] {
  return AREA_ORDER
    .map((area) => ({ area, guides: HELP_GUIDES.filter((g) => g.area === area) }))
    .filter((x) => x.guides.length > 0)
}
