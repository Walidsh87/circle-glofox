'use client'

import { cn } from '@/lib/utils'

type Entry = { recorded_on: string; one_rm_grams: number; is_pr: boolean }

export function LiftChart({ entries }: { entries: Entry[] }) {
  if (entries.length < 2) return null

  const sorted = [...entries].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on))
  const kgValues = sorted.map((e) => e.one_rm_grams / 1000)
  const minKg = Math.min(...kgValues)
  const maxKg = Math.max(...kgValues)
  const range = maxKg - minKg || 1

  const W = 280
  const H = 64
  const PAD = 6

  const points = sorted.map((e, i) => {
    const x = PAD + (i / (sorted.length - 1)) * (W - PAD * 2)
    const kg = e.one_rm_grams / 1000
    const y = PAD + (1 - (kg - minKg) / range) * (H - PAD * 2)
    return { x, y, kg, date: e.recorded_on, isPr: e.is_pr }
  })

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  const improved = last.kg > first.kg
  const lineColor = improved ? 'var(--ok)' : 'var(--ink-3)'

  return (
    <div className="border-t border-line px-4 pb-3 pt-2">
      <svg width={W} height={H} className="block overflow-visible">
        {/* Fill area under line */}
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`${first.x},${H} ${polyline} ${last.x},${H}`}
          fill="url(#chartFill)"
        />
        <polyline
          points={polyline}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.isPr ? 4 : 3}
            fill={p.isPr ? 'var(--accent-ink)' : lineColor}
            stroke={p.isPr ? 'var(--surface)' : 'none'}
            strokeWidth={p.isPr ? 1.5 : 0}
            aria-label={`${p.date} — ${p.kg.toFixed(1)} kg${p.isPr ? ' (PR)' : ''}`}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between">
        <span className="font-mono text-[10.5px] text-ink-faint">{first.date}</span>
        <span className={cn('font-mono text-[10.5px] font-semibold', improved ? 'text-ok' : 'text-ink-3')}>
          {improved ? '+' : ''}{(last.kg - first.kg).toFixed(1)} kg
        </span>
        <span className="font-mono text-[10.5px] text-ink-faint">{last.date}</span>
      </div>
    </div>
  )
}
