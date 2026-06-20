import { NextResponse } from 'next/server'
import { openApiSpec } from '@/lib/api/openapi'

export const runtime = 'nodejs'

// Public API contract — no auth (it's a spec, not data). Cacheable.
export function GET() {
  return NextResponse.json(openApiSpec, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
