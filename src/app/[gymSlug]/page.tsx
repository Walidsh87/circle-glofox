import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { GymLoginForm } from './_components/gym-login-form'

export default async function GymLoginPage({ params }: { params: { gymSlug: string } }) {
  // Redirect to dashboard if already authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  // Fetch gym by slug (public lookup — bypasses RLS)
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: box } = await service
    .from('boxes')
    .select('id, name')
    .eq('slug', params.gymSlug)
    .single()

  if (!box) notFound()

  return <GymLoginForm gymName={box.name} />
}
