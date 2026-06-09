import { BELT_COLOR, type Belt } from '@/lib/skills'

const LIGHT = new Set<Belt>(['white', 'yellow', 'orange', 'green'])

export function BeltChip({ belt }: { belt: Belt }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', background: BELT_COLOR[belt], color: LIGHT.has(belt) ? '#1f2937' : '#fff' }}>
      {belt}
    </span>
  )
}
