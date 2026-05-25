'use client'

type Entry = { recorded_on: string; one_rm_grams: number }

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
    return { x, y, kg, date: e.recorded_on }
  })

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  const improved = last.kg > first.kg

  return (
    <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--c-divider)' }}>
      <svg width={W} height={H} style={{ overflow: 'visible', display: 'block' }}>
        {/* Fill area under line */}
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={improved ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)'} stopOpacity="0.15" />
            <stop offset="100%" stopColor={improved ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`${first.x},${H} ${polyline} ${last.x},${H}`}
          fill="url(#chartFill)"
        />
        <polyline
          points={polyline}
          fill="none"
          stroke={improved ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)'}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3}
            fill={improved ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)'}
            aria-label={`${p.date} — ${p.kg.toFixed(1)} kg`}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-faint)' }}>{first.date}</span>
        <span className="mono" style={{ fontSize: 10.5, color: improved ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)', fontWeight: 600 }}>
          {improved ? '+' : ''}{(last.kg - first.kg).toFixed(1)} kg
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-faint)' }}>{last.date}</span>
      </div>
    </div>
  )
}
