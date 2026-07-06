import { TaskItem, type TaskRow } from '@/app/dashboard/tasks/_components/task-item'

interface Props {
  tasks: TaskRow[]
}

export function DeskTaskQueue({ tasks }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-semibold text-ink">Due now</span>
        {tasks.length > 0 && (
          <span className="rounded bg-danger-soft px-1.5 py-px font-mono text-[10.5px] font-semibold text-danger">
            {tasks.length}
          </span>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-3">No tasks due today — you&apos;re clear.</p>
      ) : (
        <div className="flex flex-col gap-2 p-3">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
