'use client'

import { useState, type ReactNode } from 'react'

// Right-rail "Membership plans" card: a "+ New plan" button toggles a panel holding
// the existing AddMembershipPlanForm (+ CreateStripePlanForm when Stripe is connected);
// the plan list (PlanRailRow rows) is passed as children.
export function PlansRailCard({
  addForm,
  stripeForm,
  children,
}: {
  addForm: ReactNode
  stripeForm: ReactNode | null
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-[13.5px] font-semibold text-ink">Membership plans</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-md border border-line px-2.5 py-1 text-[11.5px] font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {open ? 'Close' : '+ New plan'}
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-b border-line p-4">
          {addForm}
          {stripeForm}
        </div>
      )}
      {children}
    </div>
  )
}
