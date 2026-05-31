'use server'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const params = await ctx.params
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await service
    .from('boxes')
    .select('name, logo_url')
    .eq('slug', params.slug)
    .single()

  if (!data) return NextResponse.json({ error: 'Gym not found.' }, { status: 404 })

  return NextResponse.json({ name: data.name, logoUrl: data.logo_url })
}
