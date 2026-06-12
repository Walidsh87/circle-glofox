import { requireManagerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { SmsComposeForm } from './_components/sms-compose-form'
import { SmsList, type SmsRow } from './_components/sms-list'
import { smsConfigured } from '@/lib/twilio'

export default async function SmsPage() {
  const { supabase, profile, boxName } = await requireManagerPage()

  const [{ data: tagRows }, { data: campaignRows }] = await Promise.all([
    supabase.from('member_tags').select('tag').eq('box_id', profile.box_id),
    supabase.from('sms_campaigns').select('id, body, audience_status, audience_tag, created_at, sent_count, failed_count, skipped_count').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
  ])
  const tags = [...new Set(((tagRows ?? []) as { tag: string }[]).map((t) => t.tag))].sort()
  const rows = (campaignRows ?? []) as SmsRow[]

  return (
    <DashboardShell
      active="sms"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="SMS"
    >
      <div className="max-w-[640px]">
        <SmsComposeForm tags={tags} configured={smsConfigured()} />
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.04em] text-ink-3">History</h2>
        <SmsList rows={rows} />
      </div>
    </DashboardShell>
  )
}
