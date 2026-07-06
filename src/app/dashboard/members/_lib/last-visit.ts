// Pure relative-day label for a member's last checked-in visit, used by the People
// directory's "Last visit" column. `lastDate` and `today` are gym-timezone YYYY-MM-DD
// strings; `stale` marks members not seen for 14+ days (rendered in red).

export function lastVisit(
  lastDate: string | null,
  today: string
): { label: string | null; stale: boolean } {
  if (!lastDate) return { label: null, stale: false }
  const days = Math.floor((Date.parse(today) - Date.parse(lastDate)) / 86_400_000)
  if (days <= 0) return { label: 'today', stale: false }
  if (days === 1) return { label: 'yesterday', stale: false }
  return { label: `${days}d ago`, stale: days >= 14 }
}
