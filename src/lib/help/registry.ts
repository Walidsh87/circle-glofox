import type { HelpGuide, HelpArea } from './types'
import { AREA_ORDER } from './types'
import { overview } from './guides/overview'
import { guide as gettingStarted } from './guides/getting-started'
import { guide as settingsAndKeys } from './guides/settings-and-keys'
import { guide as staffRoles } from './guides/staff-roles'
import { guide as securityCompliance } from './guides/security-compliance'
import { guide as plansAndPackages } from './guides/plans-and-packages'
import { guide as paymentsAndStripe } from './guides/payments-and-stripe'
import { guide as invoicesRefundsDunning } from './guides/invoices-refunds-dunning'
import { guide as frontDesk } from './guides/front-desk'
import { guide as classesAndScheduling } from './guides/classes-and-scheduling'
import { guide as bookingWaitlistCheckin } from './guides/booking-waitlist-checkin'
import { guide as dailyWodAndPlanner } from './guides/daily-wod-and-planner'
import { guide as programStore } from './guides/program-store'
import { guide as theWedgeAndMovementVideos } from './guides/the-wedge-and-movement-videos'
import { guide as leadsAndLifecycle } from './guides/leads-and-lifecycle'
import { guide as campaignsAndAutomations } from './guides/campaigns-and-automations'
import { guide as embedWidgets } from './guides/embed-widgets'
import { guide as integrations } from './guides/integrations'

export const HELP_GUIDES: HelpGuide[] = [overview, gettingStarted, settingsAndKeys, staffRoles, securityCompliance, plansAndPackages, paymentsAndStripe, invoicesRefundsDunning, frontDesk, classesAndScheduling, bookingWaitlistCheckin, dailyWodAndPlanner, programStore, theWedgeAndMovementVideos, leadsAndLifecycle, campaignsAndAutomations, embedWidgets, integrations]

export function findGuide(slug: string | undefined): HelpGuide | null {
  if (slug) { const g = HELP_GUIDES.find((x) => x.slug === slug); if (g) return g }
  return HELP_GUIDES[0] ?? null
}
export function guidesByArea(): { area: HelpArea; guides: HelpGuide[] }[] {
  return AREA_ORDER
    .map((area) => ({ area, guides: HELP_GUIDES.filter((g) => g.area === area) }))
    .filter((x) => x.guides.length > 0)
}
