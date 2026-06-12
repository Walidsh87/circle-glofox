import { requireManagerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { WaTemplatesManager, type WaTemplate } from './_components/wa-templates-manager'
import { WaComposeForm } from './_components/wa-compose-form'
import { WaList, type WaRow } from './_components/wa-list'
import { waConfigured } from '@/lib/twilio'

export default async function WhatsAppPage() {
  const { supabase, profile, boxName } = await requireManagerPage()

  const [{ data: tplRows }, { data: tagRows }, { data: campaignRows }] = await Promise.all([
    supabase.from('wa_templates').select('id, name, content_sid, body_preview, var_count').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
    supabase.from('member_tags').select('tag').eq('box_id', profile.box_id),
    supabase.from('wa_campaigns').select('id, body_preview, audience_status, audience_tag, created_at, sent_count, failed_count, skipped_count').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
  ])
  const templates = (tplRows ?? []) as WaTemplate[]
  const tags = [...new Set(((tagRows ?? []) as { tag: string }[]).map((t) => t.tag))].sort()
  const rows = (campaignRows ?? []) as WaRow[]

  return (
    <DashboardShell
      active="whatsapp"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="WhatsApp"
    >
      <div className="max-w-[640px]">
        <WaTemplatesManager templates={templates} />
        <WaComposeForm templates={templates} tags={tags} configured={waConfigured()} />
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.04em] text-ink-3">History</h2>
        <WaList rows={rows} />
      </div>
    </DashboardShell>
  )
}
