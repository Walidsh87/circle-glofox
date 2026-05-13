import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AddMemberForm } from './_components/add-member-form'
import { RemoveMemberButton } from './_components/remove-member-button'

export default async function MembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, created_at')
    .eq('box_id', profile.box_id)
    .order('created_at', { ascending: true })

  const isOwner = profile.role === 'owner'

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold">Members</h1>
          <span className="text-sm text-gray-400">{members?.length ?? 0} total</span>
        </div>

        {isOwner && (
          <div className="bg-white rounded-xl border p-4 mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Add member</p>
            <AddMemberForm />
          </div>
        )}

        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
                {isOwner && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {members?.map((member) => (
                <tr key={member.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{member.full_name}</td>
                  <td className="px-4 py-3 text-gray-500">{member.email}</td>
                  <td className="px-4 py-3 text-gray-500">{member.phone ?? '—'}</td>
                  <td className="px-4 py-3 capitalize text-gray-500">{member.role}</td>
                  {isOwner && (
                    <td className="px-4 py-3 text-right">
                      {member.id !== user.id && (
                        <RemoveMemberButton memberId={member.id} memberName={member.full_name} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {(!members || members.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No members yet.
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
