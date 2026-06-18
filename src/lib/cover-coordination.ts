// Pure grouping/formatter for the manager cover-coordination view (#106).
// Mirror of the one<T> unwrap pattern from src/app/dashboard/cover/page.tsx.

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export type SubRequestRecord = {
  id: string
  status: string
  note: string | null
  posted_at: string
  claimed_at: string | null
  class_instances:
    | {
        starts_at: string
        duration_minutes: number
        class_templates: { name: string | null } | { name: string | null }[] | null
      }
    | {
        starts_at: string
        duration_minutes: number
        class_templates: { name: string | null } | { name: string | null }[] | null
      }[]
    | null
  poster: { full_name: string | null } | { full_name: string | null }[] | null
  claimer: { full_name: string | null } | { full_name: string | null }[] | null
}

export type CoordRow = {
  id: string
  className: string
  whenLabel: string
  poster: string
  claimer: string | null
  postedLabel: string
  claimedLabel: string | null
  note: string | null
}

function makeFmt(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function fmt(iso: string, formatter: Intl.DateTimeFormat): string {
  return formatter.format(new Date(iso))
}

function toCoordRow(r: SubRequestRecord, formatter: Intl.DateTimeFormat): CoordRow {
  const inst = one(r.class_instances)
  const className = one(inst?.class_templates ?? null)?.name ?? 'Class'
  const whenLabel = inst ? fmt(inst.starts_at, formatter) : ''
  const poster = one(r.poster)?.full_name ?? 'Unknown'
  const claimer = one(r.claimer)?.full_name ?? null
  const postedLabel = fmt(r.posted_at, formatter)
  const claimedLabel = r.claimed_at ? fmt(r.claimed_at, formatter) : null

  return {
    id: r.id,
    className,
    whenLabel,
    poster,
    claimer,
    postedLabel,
    claimedLabel,
    note: r.note,
  }
}

function startsAt(r: SubRequestRecord): string {
  return one(r.class_instances)?.starts_at ?? ''
}

export function buildCoordinationView(
  rows: SubRequestRecord[],
  timeZone: string,
): {
  open: CoordRow[]
  claimed: CoordRow[]
  cancelled: CoordRow[]
  counts: { open: number; claimed: number; cancelled: number; total: number }
} {
  const formatter = makeFmt(timeZone)

  const open: CoordRow[] = []
  const claimed: CoordRow[] = []
  const cancelled: CoordRow[] = []

  for (const r of rows) {
    if (r.status === 'open') {
      open.push(toCoordRow(r, formatter))
    } else if (r.status === 'claimed') {
      claimed.push(toCoordRow(r, formatter))
    } else if (r.status === 'cancelled') {
      cancelled.push(toCoordRow(r, formatter))
    }
    // unknown statuses are silently ignored
  }

  // Sort on raw ISO strings for correctness (whenLabel is for display only)
  const sortedRowsFor = (group: CoordRow[], sourceRows: SubRequestRecord[], statusFilter: string) => {
    const indexed = sourceRows
      .filter((r) => r.status === statusFilter)
      .sort((a, b) => startsAt(a).localeCompare(startsAt(b)))
      .map((r) => r.id)
    const byId = new Map(group.map((row) => [row.id, row]))
    return indexed.map((id) => byId.get(id)).filter((r): r is CoordRow => r !== undefined)
  }

  return {
    open: sortedRowsFor(open, rows, 'open'),
    claimed: sortedRowsFor(claimed, rows, 'claimed'),
    cancelled: sortedRowsFor(cancelled, rows, 'cancelled'),
    counts: {
      open: open.length,
      claimed: claimed.length,
      cancelled: cancelled.length,
      total: open.length + claimed.length + cancelled.length,
    },
  }
}
