import { Card } from '@/components/ui/card'
import { TaskItem, type TaskRow } from '@/app/dashboard/tasks/_components/task-item'

interface Props {
  tasks: TaskRow[]
}

export function DeskTaskQueue({ tasks }: Props) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-[12.5px] font-bold uppercase tracking-[0.04em] text-ink-3">
        Today&apos;s tasks ({tasks.length})
      </div>
      <Card className="p-4">
        {tasks.length === 0 ? (
          <p className="text-sm text-ink-3">No tasks due today — you&apos;re clear.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
