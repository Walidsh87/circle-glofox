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

type Zone = { label: string; bg: string; ink: string }

function getZone(pct: number): Zone {
  if (pct <= 65) return { label: 'Warm-up', bg: 'var(--c-ok-soft)',      ink: 'var(--c-ok-ink)' }
  if (pct <= 79) return { label: 'Work',    bg: 'var(--c-warn-soft)',    ink: 'var(--c-warn-ink)' }
  if (pct <= 94) return { label: 'Heavy',   bg: 'var(--c-danger-soft)',  ink: 'var(--c-danger-ink)' }
  return              { label: 'Max',     bg: 'var(--circle-lime-soft)', ink: 'var(--circle-lime-ink)' }
}

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
    const roundedKg = roundTo2_5(exactKg)
    return { pct, z, isZoneStart, exactKg, roundedKg }
  })

  return (
    <div style={{
      background: 'var(--c-surface)',
      border: '1px solid var(--c-border)',
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: 'var(--c-shadow-sm)',
    }}>

      {/* Dark hero header */}
      <div style={{
        background: 'var(--circle-ink)',
        padding: '22px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: -50, top: -50, width: 180, height: 180, borderRadius: '50%', border: '2px solid var(--circle-lime)', opacity: 0.12 }} />
        <div style={{ position: 'absolute', right: 20, bottom: -30, width: 100, height: 100, borderRadius: '50%', background: 'var(--circle-lime)', opacity: 0.06 }} />

        <div style={{ position: 'relative' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14 }}>
            % Calculator
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            {/* Lift selector */}
            <select
              value={selectedLift}
              onChange={(e) => setSelectedLift(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 9, padding: '9px 12px',
                fontSize: 14, fontWeight: 600,
                color: lifts.length === 0 ? 'rgba(250,250,250,0.35)' : '#FAFAFA',
                fontFamily: 'var(--font-space-grotesk)',
                cursor: 'pointer', outline: 'none',
                minWidth: 210,
              }}
            >
              {lifts.length === 0 && <option value="">Log a lift above first</option>}
              {lifts.map((l) => {
                const label = LIFT_NAMES.find((n) => n.value === l.lift_name)?.label ?? l.lift_name
                return (
                  <option key={l.lift_name} value={l.lift_name} style={{ background: '#1a1a1a' }}>
                    {label} — {l.one_rm_grams / 1000} kg
                  </option>
                )
              })}
            </select>

            {/* kg / lb toggle */}
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.14)', flexShrink: 0 }}>
              {(['kg', 'lb'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  style={{
                    padding: '7px 16px',
                    background: unit === u ? 'var(--circle-lime)' : 'transparent',
                    color: unit === u ? 'var(--circle-ink)' : 'rgba(250,250,250,0.55)',
                    border: 'none', cursor: 'pointer',
                    fontSize: 11.5, fontWeight: 700,
                    fontFamily: 'var(--font-geist-mono)',
                    letterSpacing: '0.06em',
                    transition: 'background 120ms, color 120ms',
                  }}
                >{u.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {/* 1RM big display */}
          {oneRmKg && (
            <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                fontFamily: 'var(--font-space-grotesk)',
                fontSize: 48, fontWeight: 800,
                color: 'var(--circle-lime)',
                letterSpacing: '-0.04em', lineHeight: 1,
              }}>
                {unit === 'kg' ? oneRmKg : kgToLb(oneRmKg)}
              </span>
              <span className="mono" style={{ fontSize: 18, color: 'rgba(250,250,250,0.45)', marginBottom: 2 }}>{unit}</span>
              <span style={{ fontSize: 13, color: 'rgba(250,250,250,0.4)', marginLeft: 6 }}>{liftLabel}</span>
            </div>
          )}

          {/* Cross-unit hint */}
          {oneRmKg && (
            <div className="mono" style={{ marginTop: 6, fontSize: 11.5, color: 'rgba(250,250,250,0.35)', letterSpacing: '0.02em' }}>
              {unit === 'kg'
                ? `${kgToLb(oneRmKg)} lb`
                : `${oneRmKg} kg`}
            </div>
          )}
        </div>
      </div>

      {/* Empty states */}
      {lifts.length === 0 && (
        <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
          Log a 1RM above to unlock your percentage table.
        </div>
      )}
      {lifts.length > 0 && !oneRmKg && (
        <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
          Select a lift to see your percentages.
        </div>
      )}

      {/* Table */}
      {oneRmKg && (
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)' }}>
              <Th style={{ width: 88 }}>Zone</Th>
              <Th style={{ textAlign: 'center', width: 56 }}>%</Th>
              <Th style={{ textAlign: 'right' }}>Exact</Th>
              <Th style={{ textAlign: 'right', paddingRight: 20 }}>On the bar</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pct, z, isZoneStart, exactKg, roundedKg }, i) => {
              const exact    = unit === 'kg' ? exactKg       : kgToLb(exactKg)
              const rounded  = unit === 'kg' ? roundedKg     : kgToLb(roundedKg)
              const isHeavy  = pct >= 80
              const isMax    = pct >= 95

              return (
                <tr key={pct} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--c-divider)' : 'none' }}>
                  {/* Zone pill — only on first row of each zone */}
                  <td style={{ padding: '10px 16px' }}>
                    {isZoneStart && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '2px 8px', borderRadius: 999,
                        fontSize: 10, fontWeight: 700,
                        fontFamily: 'var(--font-geist-mono)',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                        background: z.bg, color: z.ink,
                        whiteSpace: 'nowrap',
                      }}>{z.label}</span>
                    )}
                  </td>

                  {/* % */}
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <span className="mono" style={{
                      fontSize: 13, fontWeight: 600,
                      color: isMax ? z.ink : isHeavy ? 'var(--c-ink-2)' : 'var(--c-ink-faint)',
                    }}>{pct}%</span>
                  </td>

                  {/* Exact */}
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-faint)' }}>
                      {unit === 'kg' ? exact.toFixed(1) : exact} {unit}
                    </span>
                  </td>

                  {/* On the bar — the number that matters */}
                  <td style={{ padding: '10px 20px 10px 16px', textAlign: 'right' }}>
                    <span className="mono" style={{
                      fontSize: isHeavy ? 20 : 15,
                      fontWeight: 700,
                      letterSpacing: '-0.015em',
                      color: isMax ? z.ink : isHeavy ? 'var(--c-ink)' : 'var(--c-ink-2)',
                    }}>{rounded}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-faint)', marginLeft: 3 }}>{unit}</span>
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

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{
      padding: '9px 16px', textAlign: 'left',
      fontFamily: 'var(--font-geist-mono)', fontSize: 10.5,
      fontWeight: 500, color: 'var(--c-ink-muted)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      ...style,
    }}>{children}</th>
  )
}
