import { CampaignList, type CampaignRow } from '@/app/dashboard/_components/campaign-list'

export type BroadcastRow = {
  id: string
  subject: string
  audience_status: string
  audience_tag: string | null
  created_at: string
  status: string
  recipient_count: number
  sent_count: number
  failed_count: number
  skipped_count: number
}

export function BroadcastsList({ rows }: { rows: BroadcastRow[] }) {
  const items: CampaignRow[] = rows.map((b) => ({ ...b, title: b.subject }))
  return <CampaignList rows={items} hrefBase="/dashboard/broadcasts" emptyText="No broadcasts yet." />
}
