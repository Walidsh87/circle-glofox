import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AddMembershipForm } from './_components/add-membership-form'
import { PaymentActions } from './_components/payment-actions'

const STATUS_STYLES: Record<string, string> = {
  paid:    'bg-green-100 text-green-700',
  unpaid:  'bg-yellow-100 text-yellow-700',
  overdue: 'bg-red-100 text-red-700',
}

export default async function PaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')

  const [{ data: memberships }, { data: athletes }] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, plan_name, monthly_price_aed, start_date, payment_status, last_paid_date, profiles(full_name)')
      .eq('box_id', profile.box_id)
      .order('payment_status')
      .order('start_date', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('box_id', profile.box_id)
      .eq('role', 'athlete')
      .order('full_name'),
  ])

  const unpaidCount = memberships?.filter((m) => m.payment_status !== 'paid').length ?? 0

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">← Dashboard</Link>
          <h1 className="text-xl font-bold">Payments</h1>
          {unpaidCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
              {unpaidCount} unpaid
            </span>
          )}
        </div>

        <div className="bg-white rounded-xl border p-4 mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Add membership</p>
          <AddMembershipForm athletes={athletes ?? []} />
        </div>

        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Athlete</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Plan</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Price (AED)</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Start</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Last paid</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {memberships?.map((m) => {
                const athleteProfile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
                return (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{athleteProfile?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{m.plan_name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {m.monthly_price_aed ? `${m.monthly_price_aed}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{m.start_date}</td>
                    <td className="px-4 py-3 text-gray-500">{m.last_paid_date ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[m.payment_status] ?? ''}`}>
                        {m.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PaymentActions membershipId={m.id} currentStatus={m.payment_status} />
                    </td>
                  </tr>
                )
              })}
              {(!memberships || memberships.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No memberships yet.
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
