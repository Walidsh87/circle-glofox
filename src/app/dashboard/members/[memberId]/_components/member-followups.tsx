'use client'

import { QuickAdd } from '@/app/dashboard/tasks/_components/quick-add'
import { TaskItem, type TaskRow } from '@/app/dashboard/tasks/_components/task-item'

export function MemberFollowups({ memberId, tasks }: { memberId: string; tasks: TaskRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <QuickAdd memberId={memberId} placeholder="Add a follow-up for this member…" />
      {tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tasks.map((t) => <TaskItem key={t.id} task={t} />)}
        </div>
      )}
    </div>
  )
}
