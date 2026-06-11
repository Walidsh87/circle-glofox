import { Skeleton } from '@/components/ui/skeleton'

export default function GymLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    </div>
  )
}
