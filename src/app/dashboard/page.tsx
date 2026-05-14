import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SignOutButton } from './_components/sign-out-button'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const boxes = profile.boxes as { name: string }[] | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : ''

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-sm border p-8 w-full max-w-sm">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{boxName}</p>
        <h1 className="text-xl font-bold mb-1">Welcome, {profile.full_name}</h1>
        <p className="text-sm text-gray-500 mb-6 capitalize">{profile.role}</p>
        <div className="flex flex-col gap-2 mb-6">
          {profile.role === 'owner' && (
            <Link href="/dashboard/members"
              className="text-sm text-primary underline-offset-4 hover:underline">
              Members →
            </Link>
          )}
          {['owner', 'coach'].includes(profile.role) && (
            <Link href="/dashboard/classes"
              className="text-sm text-primary underline-offset-4 hover:underline">
              Class Schedule →
            </Link>
          )}
          <Link href="/dashboard/schedule"
            className="text-sm text-primary underline-offset-4 hover:underline">
            Book a Class →
          </Link>
          {['owner', 'coach'].includes(profile.role) && (
            <Link href="/dashboard/whiteboard"
              className="text-sm text-primary underline-offset-4 hover:underline">
              Whiteboard →
            </Link>
          )}
          {['owner', 'coach'].includes(profile.role) && (
            <Link href="/dashboard/wod"
              className="text-sm text-primary underline-offset-4 hover:underline">
              Daily WOD →
            </Link>
          )}
          <Link href="/dashboard/lifts"
            className="text-sm text-primary underline-offset-4 hover:underline">
            My 1RMs →
          </Link>
          {profile.role === 'owner' && (
            <Link href="/dashboard/payments"
              className="text-sm text-primary underline-offset-4 hover:underline">
              Payments →
            </Link>
          )}
        </div>
        <SignOutButton />
      </div>
    </main>
  )
}
