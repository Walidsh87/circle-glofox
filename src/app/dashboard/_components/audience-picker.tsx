'use client'

import { SEGMENTS, SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

/** Shared status + tag audience selector with a live recipient-count readout, used by the
 *  email / SMS / WhatsApp compose forms. The parent owns the count refresh (each channel
 *  has its own preview action), so the change handlers receive the next value. */
export function AudiencePicker({
  status,
  tag,
  tags,
  count,
  selectClassName,
  onStatusChange,
  onTagChange,
}: {
  status: Segment
  tag: string
  tags: string[]
  count: number | null
  selectClassName: string
  onStatusChange: (status: Segment) => void
  onTagChange: (tag: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <select className={selectClassName} value={status} onChange={(e) => onStatusChange(e.target.value as Segment)}>
        {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
      </select>
      <select className={selectClassName} value={tag} onChange={(e) => onTagChange(e.target.value)}>
        <option value="">Any tag</option>
        {tags.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <span className="self-center text-[13px] text-ink-3">
        {count === null ? 'Choose an audience to preview count' : `${count} recipient${count === 1 ? '' : 's'}`}
      </span>
    </div>
  )
}
