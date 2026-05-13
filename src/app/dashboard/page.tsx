import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SignOutButton } from './_components/sign-out-button'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/')

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-sm border p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">Dashboard</h1>
        <p className="text-sm text-gray-500 mb-6">
          Logged in as <span className="font-medium text-gray-800">{user.email}</span>
        </p>
        <SignOutButton />
      </div>
    </main>
  )
}
