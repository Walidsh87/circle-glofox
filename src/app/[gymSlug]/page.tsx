import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { GymLoginForm } from './_components/gym-login-form'

export default async function GymLoginPage(ctx: { params: Promise<{ gymSlug: string }> }) {
  const params = await ctx.params
  // Already authenticated → resume at /join (it bounces profiled members on to /dashboard)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(`/join/${params.gymSlug}`)

  // Fetch gym by slug (public lookup — bypasses RLS)
  const service = createServiceClient()

  const { data: box } = await service
    .from('boxes')
    .select('id, name')
    .eq('slug', params.gymSlug)
    .single()

  if (!box) notFound()

  return <GymLoginForm gymName={box.name} gymSlug={params.gymSlug} />
}
