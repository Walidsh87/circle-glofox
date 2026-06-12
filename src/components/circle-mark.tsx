export function CircleMark({ size = 22, onDark = false }: { size?: number; onDark?: boolean }) {
  const ringColor = '#C8F135'
  const barColor = onDark ? 'rgba(176,176,176,0.9)' : '#B0B0B0'
  return (
    <span style={{ width: size, height: size, display: 'inline-block', flexShrink: 0 }} aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none" style={{ display: 'block', width: '100%', height: '100%' }}>
        <circle cx="32" cy="32" r="24" stroke={ringColor} strokeWidth="7" fill="none" />
        <g transform="rotate(22 32 32)" fill={barColor}>
          <rect x="29.5" y="6" width="5" height="52" rx="0.6" />
          <rect x="25.5" y="8" width="13" height="3.6" rx="0.8" />
          <rect x="25.5" y="52.4" width="13" height="3.6" rx="0.8" />
          <rect x="27" y="13.2" width="10" height="2.6" rx="0.6" />
          <rect x="27" y="48.2" width="10" height="2.6" rx="0.6" />
        </g>
      </svg>
    </span>
  )
}
