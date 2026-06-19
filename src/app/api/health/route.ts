import { NextResponse } from 'next/server'

// Liveness probe for external uptime monitoring (Better Uptime / UptimeRobot / etc.).
// Intentionally touches NO database and NO secret — a cheap, constant 200 so a
// public monitor can never be turned into a cost or DoS vector.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ status: 'ok' })
}
