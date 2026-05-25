import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Skip gate on the signing page itself to prevent redirect loop
  const pathname = headers().get('x-pathname') ?? ''
  if (pathname === '/dashboard/sign-waiver') {
    return <>{children}</>
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Middleware already redirects unauthenticated users — guard here is just safety
  if (!user) return <>{children}</>

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id')
    .eq('id', user.id)
    .maybeSingle()

  // Owners and coaches are exempt from the waiver gate
  if (!profile || profile.role !== 'athlete') {
    return <>{children}</>
  }

  const { data: signature } = await supabase
    .from('waiver_signatures')
    .select('id')
    .eq('box_id', profile.box_id)
    .eq('athlete_id', user.id)
    .maybeSingle()

  if (!signature) {
    redirect('/dashboard/sign-waiver')
  }

  return <>{children}</>
}
