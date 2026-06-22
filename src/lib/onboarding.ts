// New-gym onboarding checklist (pilot UX). Pure — no Supabase (coverage-gated).
export type OnboardingSignals = {
  hasBranding: boolean
  hasStripe: boolean
  hasPlan: boolean
  hasClassTemplate: boolean
  hasWod: boolean
  hasStaff: boolean
  hasMember: boolean
}
export type OnboardingStep = { key: string; label: string; done: boolean; href: string; helpTopic: string }

export function buildOnboardingSteps(s: OnboardingSignals): OnboardingStep[] {
  return [
    { key: 'branding', label: 'Set your gym name & logo', done: s.hasBranding, href: '/dashboard/settings', helpTopic: 'getting-started' },
    { key: 'stripe', label: 'Connect Stripe to take payments', done: s.hasStripe, href: '/dashboard/settings', helpTopic: 'payments-and-stripe' },
    { key: 'plan', label: 'Create a membership plan', done: s.hasPlan, href: '/dashboard/payments', helpTopic: 'plans-and-packages' },
    { key: 'class', label: 'Add a class template', done: s.hasClassTemplate, href: '/dashboard/classes', helpTopic: 'classes-and-scheduling' },
    { key: 'wod', label: 'Post your first WOD', done: s.hasWod, href: '/dashboard/wod', helpTopic: 'daily-wod-and-planner' },
    { key: 'staff', label: 'Invite a coach or staff member', done: s.hasStaff, href: '/dashboard/members?tab=staff', helpTopic: 'staff-roles' },
    { key: 'member', label: 'Add your first member', done: s.hasMember, href: '/dashboard/members', helpTopic: 'getting-started' },
  ]
}
export function onboardingComplete(steps: OnboardingStep[]): boolean { return steps.every((s) => s.done) }
export function onboardingProgress(steps: OnboardingStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length }
}
