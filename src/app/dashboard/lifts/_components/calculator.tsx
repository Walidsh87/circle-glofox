'use client'

import { useState } from 'react'
import { LIFT_NAMES } from '../_lib/lift-names'

const PERCENTAGES = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105]

function roundTo2_5(kg: number): number {
  return Math.round(kg / 2.5) * 2.5
}

function kgToLb(kg: number): number {
  return Math.round(kg * 2.2046 * 10) / 10
}

function rowZone(pct: number): string {
  if (pct <= 65) return 'bg-blue-50 text-blue-900'
  if (pct <= 85) return 'bg-amber-50 text-amber-900'
  return 'bg-red-50 text-red-900'
}

type Lift = { lift_name: string; one_rm_grams: number }

export function Calculator({ lifts }: { lifts: Lift[] }) {
  const [selectedLift, setSelectedLift] = useState(lifts[0]?.lift_name ?? '')
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')

  const lift = lifts.find((l) => l.lift_name === selectedLift)
  const oneRmKg = lift ? lift.one_rm_grams / 1000 : null
  const liftLabel = LIFT_NAMES.find((l) => l.value === selectedLift)?.label ?? selectedLift

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-800">% Calculator</h2>
          <select
            value={selectedLift}
            onChange={(e) => setSelectedLift(e.target.value)}
            className="rounded-md border border-input bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select lift</option>
            {lifts.map((l) => {
              const label = LIFT_NAMES.find((n) => n.value === l.lift_name)?.label ?? l.lift_name
              return (
                <option key={l.lift_name} value={l.lift_name}>
                  {label} — {l.one_rm_grams / 1000}kg
                </option>
              )
            })}
          </select>
        </div>
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(['kg', 'lb'] as const).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`px-3 py-1 ${unit === u ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {!oneRmKg && (
        <p className="px-5 py-8 text-center text-gray-400 text-sm">
          Log a 1RM above to see your percentages.
        </p>
      )}

      {oneRmKg && (
        <>
          <div className="px-5 py-3 border-b">
            <p className="text-sm text-gray-500">
              {liftLabel} 1RM: <span className="font-bold text-gray-900">{oneRmKg}kg</span>
              <span className="text-gray-400 ml-2">({kgToLb(oneRmKg)} lb)</span>
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-5 py-2 font-medium text-gray-500 w-16">%</th>
                <th className="text-right px-5 py-2 font-medium text-gray-500">Exact</th>
                <th className="text-right px-5 py-2 font-medium text-gray-500">Nearest 2.5</th>
              </tr>
            </thead>
            <tbody>
              {PERCENTAGES.map((pct) => {
                const exact = (oneRmKg * pct) / 100
                const rounded = roundTo2_5(exact)
                const display = unit === 'kg'
                  ? { exact: `${exact.toFixed(1)} kg`, rounded: `${rounded} kg` }
                  : { exact: `${kgToLb(exact)} lb`, rounded: `${kgToLb(rounded)} lb` }
                return (
                  <tr key={pct} className={`border-b last:border-0 ${rowZone(pct)}`}>
                    <td className="px-5 py-2.5 font-bold">{pct}%</td>
                    <td className="px-5 py-2.5 text-right text-gray-500 text-xs">{display.exact}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-base">{display.rounded}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
