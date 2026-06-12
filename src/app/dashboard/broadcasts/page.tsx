import { requireManagerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { ComposeForm, type TemplateOption } from './_components/compose-form'
import { TemplatesManager } from './_components/templates-manager'
import { BroadcastsList, type BroadcastRow } from './_components/broadcasts-list'

export default async function BroadcastsPage() {
  const { supabase, profile, boxName } = await requireManagerPage()

  const [{ data: tagRows }, { data: broadcastRows }, { data: templateRows }] = await Promise.all([
    supabase.from('member_tags').select('tag').eq('box_id', profile.box_id),
    supabase.from('broadcasts').select('id, subject, audience_status, audience_tag, created_at, status, recipient_count, sent_count, failed_count, skipped_count').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
    supabase.from('email_templates').select('id, name, subject, body_blocks').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
  ])
  const tags = [...new Set(((tagRows ?? []) as { tag: string }[]).map((t) => t.tag))].sort()
  const rows = (broadcastRows ?? []) as BroadcastRow[]
  const templates = (templateRows ?? []) as TemplateOption[]

  return (
    <DashboardShell
      active="broadcasts"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Broadcasts"
    >
      <div className="max-w-2xl">
        <ComposeForm tags={tags} templates={templates} />
        <TemplatesManager templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.04em] text-ink-3">History</h2>
        <BroadcastsList rows={rows} />
      </div>
    </DashboardShell>
  )
}
