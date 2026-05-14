import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LiftForm } from './_components/lift-form'
import { LIFT_NAMES } from './_lib/lift-names'
import { Calculator } from './_components/calculator'

export default async function LiftsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const { data: lifts } = await supabase
    .from('athlete_lifts')
    .select('lift_name, one_rm_grams, recorded_on')
    .eq('athlete_id', user.id)
    .order('lift_name')

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold">My 1RMs</h1>
        </div>

        {/* Log form */}
        <div className="bg-white rounded-xl border p-5 mb-6">
          <p className="text-sm font-medium text-gray-700 mb-4">Log or update a 1RM</p>
          <LiftForm lifts={lifts ?? []} />
        </div>

        {/* Current 1RMs table */}
        {lifts && lifts.length > 0 && (
          <div className="bg-white rounded-xl border overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Lift</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">1RM (kg)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {lifts.map((lift) => (
                  <tr key={lift.lift_name} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {LIFT_NAMES.find((l) => l.value === lift.lift_name)?.label ?? lift.lift_name}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {lift.one_rm_grams / 1000} kg
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">
                      {lift.recorded_on}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* THE WEDGE: percentage calculator */}
        <Calculator lifts={lifts ?? []} />
      </div>
    </main>
  )
}
