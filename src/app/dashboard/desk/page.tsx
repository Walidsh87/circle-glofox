import { requireStaffPage } from '@/lib/auth/page-guards'
import { DeskSearch } from './_components/DeskSearch'

export default async function DeskPage() {
  await requireStaffPage()
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Front Desk</h1>
      <p className="mb-5 text-[13px] text-ink-3">Search a member or lead, then check in, take payment, or sign up a walk-in.</p>
      <DeskSearch />
    </div>
  )
}
