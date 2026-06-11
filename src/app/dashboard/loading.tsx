import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
