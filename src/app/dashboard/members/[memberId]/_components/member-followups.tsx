'use client'

import { QuickAdd } from '@/app/dashboard/tasks/_components/quick-add'
import { TaskItem, type TaskRow } from '@/app/dashboard/tasks/_components/task-item'

export function MemberFollowups({ memberId, tasks, staff }: { memberId: string; tasks: TaskRow[]; staff: { id: string; full_name: string | null }[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <QuickAdd memberId={memberId} placeholder="Add a follow-up for this member…" staff={staff} />
      {tasks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {tasks.map((t) => <TaskItem key={t.id} task={t} />)}
        </div>
      )}
    </div>
  )
}
