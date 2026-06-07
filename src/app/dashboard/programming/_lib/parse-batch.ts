export type ParsedDay = {
  date: string
  title: string
  description: string
  scoringType: string
  error: string | null
}

// Accepted scoring words (lower-cased) → workouts.scoring_type token.
const SCORING_ALIASES: Record<string, string> = {
  'time': 'time', 'for time': 'time', 'fortime': 'time', 'ft': 'time',
  'amrap': 'amrap',
  'rounds_reps': 'rounds_reps', 'rounds + reps': 'rounds_reps',
  'rounds and reps': 'rounds_reps', 'rounds reps': 'rounds_reps', 'rounds': 'rounds_reps',
  'load_kg': 'load_kg', 'load': 'load_kg', 'max load': 'load_kg', 'weight': 'load_kg',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function parseBlock(block: string[], seen: Set<string>): ParsedDay {
  const header = block[0] ?? ''
  const firstSpace = header.search(/\s/)
  const date = firstSpace === -1 ? header : header.slice(0, firstSpace)
  const scoringWord = firstSpace === -1 ? '' : header.slice(firstSpace + 1).trim().toLowerCase()
  const title = (block[1] ?? '').trim()
  const description = block.slice(2).join('\n').trim()

  // Resolve scoring up front so the row carries it even when another field is invalid.
  let scoringType = 'time'
  let scoringError: string | null = null
  if (scoringWord !== '') {
    const mapped = SCORING_ALIASES[scoringWord]
    if (!mapped) scoringError = `Unknown scoring "${scoringWord}". Use: For Time, AMRAP, Rounds + Reps, or Load.`
    else scoringType = mapped
  }

  const base = { date, title, description, scoringType }
  if (!isRealDate(date)) return { ...base, error: `Invalid date "${date}". Use YYYY-MM-DD on the first line.` }
  if (!title) return { ...base, error: 'Missing title — the second line of each block is the WOD title.' }
  if (scoringError) return { ...base, error: scoringError }
  if (!description) return { ...base, error: 'Missing workout — add the WOD on the lines after the title.' }
  if (seen.has(date)) return { ...base, error: 'Duplicate date in paste — only the first block for this date is used.' }
  seen.add(date)
  return { ...base, error: null }
}

export function parseBatch(text: string): ParsedDay[] {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''))
  const blocks: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length) { blocks.push(current); current = [] }
    } else {
      current.push(line)
    }
  }
  if (current.length) blocks.push(current)

  const seen = new Set<string>()
  return blocks.map((block) => parseBlock(block, seen))
}
