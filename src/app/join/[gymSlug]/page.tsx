import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createAthlete } from './_actions/create-athlete'
import { JoinForm } from './_components/join-form'

export default async function JoinPage({ params }: { params: { gymSlug: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/${params.gymSlug}`)

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Already has a profile — go to dashboard
  const { data: existing } = await service.from('profiles').select('id').eq('id', user.id).single()
  if (existing) redirect('/dashboard')

  const { data: box } = await service.from('boxes').select('name').eq('slug', params.gymSlug).single()
  if (!box) redirect('/')

  const action = createAthlete.bind(null, params.gymSlug)

  return <JoinForm gymName={box.name} action={action} />
}
