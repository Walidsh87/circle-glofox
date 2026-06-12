'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { LIFT_NAMES } from '../_lib/lift-names'
import { roundToBar, kgToLb, getZone } from '@/lib/percentage'

const PERCENTAGES = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105]

type Lift = { lift_name: string; one_rm_grams: number }

export function Calculator({ lifts }: { lifts: Lift[] }) {
  const [selectedLift, setSelectedLift] = useState(lifts[0]?.lift_name ?? '')
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')

  const lift = lifts.find((l) => l.lift_name === selectedLift)
  const oneRmKg = lift ? lift.one_rm_grams / 1000 : null
  const liftLabel = LIFT_NAMES.find((l) => l.value === selectedLift)?.label ?? selectedLift

  // Pre-compute rows and zone-start flags
  let lastZoneLabel = ''
  const rows = PERCENTAGES.map((pct) => {
    const z = getZone(pct)
    const isZoneStart = z.label !== lastZoneLabel
    lastZoneLabel = z.label
    const exactKg = oneRmKg ? (oneRmKg * pct) / 100 : 0
    const roundedKg = roundToBar(exactKg)
    return { pct, z, isZoneStart, exactKg, roundedKg }
  })

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">

      {/* Brand-dark hero — stays literal in both themes (spec §4.3) */}
      <div className="relative overflow-hidden bg-[#0A0A0A] px-6 py-[22px]">
        <div className="absolute -right-[50px] -top-[50px] h-[180px] w-[180px] rounded-full border-2 border-[#C8F135] opacity-[0.12]" />
        <div className="absolute -bottom-[30px] right-5 h-[100px] w-[100px] rounded-full bg-[#C8F135] opacity-[0.06]" />

        <div className="relative">
          <div className="mb-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#C8F135]">
            % Calculator
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Lift selector */}
            <select
              value={selectedLift}
              onChange={(e) => setSelectedLift(e.target.value)}
              className={cn(
                'min-w-[210px] cursor-pointer rounded-[9px] border border-white/15 bg-white/[0.07] px-3 py-2 font-display text-sm font-semibold outline-none',
                lifts.length === 0 ? 'text-[#FAFAFA]/35' : 'text-[#FAFAFA]'
              )}
            >
              {lifts.length === 0 && <option value="">Log a lift above first</option>}
              {lifts.map((l) => {
                const label = LIFT_NAMES.find((n) => n.value === l.lift_name)?.label ?? l.lift_name
                return (
                  <option key={l.lift_name} value={l.lift_name} className="bg-[#1a1a1a]">
                    {label} — {l.one_rm_grams / 1000} kg
                  </option>
                )
              })}
            </select>

            {/* kg / lb toggle */}
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-white/15">
              {(['kg', 'lb'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={cn(
                    'px-4 py-[7px] font-mono text-[11.5px] font-bold tracking-[0.06em] transition-colors',
                    unit === u ? 'bg-[#C8F135] text-[#0A0A0A]' : 'bg-transparent text-[#FAFAFA]/55'
                  )}
                >{u.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {/* 1RM big display */}
          {oneRmKg && (
            <div className="mt-[18px] flex items-baseline gap-2">
              <span className="font-display text-5xl font-extrabold leading-none tracking-[-0.04em] text-[#C8F135]">
                {unit === 'kg' ? oneRmKg : kgToLb(oneRmKg)}
              </span>
              <span className="mb-0.5 font-mono text-lg text-[#FAFAFA]/45">{unit}</span>
              <span className="ml-1.5 text-[13px] text-[#FAFAFA]/40">{liftLabel}</span>
            </div>
          )}

          {/* Cross-unit hint */}
          {oneRmKg && (
            <div className="mt-1.5 font-mono text-[11.5px] tracking-[0.02em] text-[#FAFAFA]/35">
              {unit === 'kg'
                ? `${kgToLb(oneRmKg)} lb`
                : `${oneRmKg} kg`}
            </div>
          )}
        </div>
      </div>

      {/* Empty states */}
      {lifts.length === 0 && (
        <div className="px-6 py-9 text-center text-[13px] text-ink-3">
          Log a 1RM above to unlock your percentage table.
        </div>
      )}
      {lifts.length > 0 && !oneRmKg && (
        <div className="px-6 py-9 text-center text-[13px] text-ink-3">
          Select a lift to see your percentages.
        </div>
      )}

      {/* Table */}
      {oneRmKg && (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse">
          <thead>
            <tr className="border-b border-line bg-canvas">
              <Th className="w-[88px]">Zone</Th>
              <Th className="w-14 text-center">%</Th>
              <Th className="text-right">Exact</Th>
              <Th className="pr-5 text-right">On the bar</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pct, z, isZoneStart, exactKg, roundedKg }, i) => {
              const exact    = unit === 'kg' ? exactKg       : kgToLb(exactKg)
              const rounded  = unit === 'kg' ? roundedKg     : kgToLb(roundedKg)
              const isHeavy  = pct >= 80
              const isMax    = pct >= 95

              return (
                <tr key={pct} className={cn(i < rows.length - 1 && 'border-b border-line')}>
                  {/* Zone pill — only on first row of each zone */}
                  <td className="px-4 py-2.5">
                    {isZoneStart && (
                      <span className={cn(
                        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.05em]',
                        z.pill
                      )}>{z.label}</span>
                    )}
                  </td>

                  {/* % */}
                  <td className="px-2 py-2.5 text-center">
                    <span className={cn(
                      'font-mono text-[13px] font-semibold',
                      isMax ? z.ink : isHeavy ? 'text-ink-2' : 'text-ink-faint'
                    )}>{pct}%</span>
                  </td>

                  {/* Exact */}
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-mono text-[11.5px] text-ink-faint">
                      {unit === 'kg' ? exact.toFixed(1) : exact} {unit}
                    </span>
                  </td>

                  {/* On the bar — the number that matters */}
                  <td className="py-2.5 pl-4 pr-5 text-right">
                    <span className={cn(
                      'font-mono font-bold tracking-[-0.015em]',
                      isHeavy ? 'text-xl' : 'text-[15px]',
                      isMax ? z.ink : isHeavy ? 'text-ink' : 'text-ink-2'
                    )}>{rounded}</span>
                    <span className="ml-0.5 font-mono text-[10.5px] text-ink-faint">{unit}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-4 py-[9px] text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-3', className)}>
      {children}
    </th>
  )
}
