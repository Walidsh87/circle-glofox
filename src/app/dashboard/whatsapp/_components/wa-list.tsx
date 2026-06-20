import { CampaignList, type CampaignRow } from '@/app/dashboard/_components/campaign-list'

export type WaRow = {
  id: string
  body_preview: string
  audience_status: string
  audience_tag: string | null
  created_at: string
  sent_count: number
  failed_count: number
  skipped_count: number
}

export function WaList({ rows }: { rows: WaRow[] }) {
  const items: CampaignRow[] = rows.map((w) => ({ ...w, title: w.body_preview }))
  return <CampaignList rows={items} hrefBase="/dashboard/whatsapp" emptyText="No WhatsApp campaigns yet." />
}
