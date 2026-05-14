import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AddTemplateForm } from './_components/add-template-form'
import { TemplateActions } from './_components/template-actions'
import { GenerateForm } from './_components/generate-form'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export default async function ClassesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const isStaff = ['owner', 'coach'].includes(profile.role)

  const [{ data: templates }, { data: coaches }] = await Promise.all([
    supabase
      .from('class_templates')
      .select('id, name, weekday, start_time, duration_minutes, capacity, active, coach_id, profiles(full_name)')
      .eq('box_id', profile.box_id)
      .order('weekday')
      .order('start_time'),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('box_id', profile.box_id)
      .in('role', ['owner', 'coach'])
      .order('full_name'),
  ])

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold">Class Schedule</h1>
          <span className="text-sm text-gray-400">{templates?.length ?? 0} templates</span>
        </div>

        {isStaff && (
          <>
            <div className="bg-white rounded-xl border p-4 mb-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Add class template</p>
              <AddTemplateForm coaches={coaches ?? []} />
            </div>
            <div className="bg-white rounded-xl border p-4 mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Generate instances</p>
              <GenerateForm />
            </div>
          </>
        )}

        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Class</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Day</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Time</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Cap</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Coach</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                {isStaff && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {templates?.map((t) => {
                const coach = t.profiles as { full_name: string } | { full_name: string }[] | null
                const coachName = Array.isArray(coach) ? coach[0]?.full_name : coach?.full_name
                return (
                  <tr key={t.id} className={`border-b last:border-0 ${!t.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-gray-500">{WEEKDAYS[t.weekday]}</td>
                    <td className="px-4 py-3 text-gray-500">{formatTime(t.start_time)}</td>
                    <td className="px-4 py-3 text-gray-500">{t.capacity}</td>
                    <td className="px-4 py-3 text-gray-500">{coachName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {t.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isStaff && (
                      <td className="px-4 py-3">
                        <TemplateActions templateId={t.id} active={t.active} name={t.name} />
                      </td>
                    )}
                  </tr>
                )
              })}
              {(!templates || templates.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No class templates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
