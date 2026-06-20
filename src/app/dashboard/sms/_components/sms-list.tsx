import { CampaignList, type CampaignRow } from '@/app/dashboard/_components/campaign-list'

export type SmsRow = {
  id: string
  body: string
  audience_status: string
  audience_tag: string | null
  created_at: string
  sent_count: number
  failed_count: number
  skipped_count: number
}

export function SmsList({ rows }: { rows: SmsRow[] }) {
  const items: CampaignRow[] = rows.map((s) => ({ ...s, title: s.body }))
  return <CampaignList rows={items} hrefBase="/dashboard/sms" emptyText="No SMS campaigns yet." />
}
