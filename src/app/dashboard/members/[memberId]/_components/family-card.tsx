import { Badge } from '@/components/ui/badge'

type Member = { id: string; full_name: string | null }

export function FamilyCard({ householdName, members, primaryId, selfId }: {
  householdName: string
  members: Member[]
  primaryId: string
  selfId: string
}) {
  const primaryName = members.find((m) => m.id === primaryId)?.full_name ?? 'the primary member'
  return (
    <div>
      <div className="mb-2 text-[13.5px] font-semibold text-ink">{householdName}</div>
      <div className="flex flex-col gap-1.5">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-2 border-t border-line pt-1.5 text-[13px] text-ink-2">
            <span>{m.full_name ?? 'Member'}</span>
            {m.id === primaryId && <Badge tone="ok">pays</Badge>}
            {m.id === selfId && <Badge tone="neutral">you</Badge>}
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-ink-3">Covered by {primaryName}&apos;s membership.</p>
    </div>
  )
}
