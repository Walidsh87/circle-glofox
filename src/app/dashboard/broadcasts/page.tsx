import { requireManagerPage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="broadcasts" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Broadcasts</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <ComposeForm tags={tags} templates={templates} />
            <TemplatesManager templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>History</h2>
            <BroadcastsList rows={rows} />
          </div>
        </div>
      </div>
    </div>
  )
}
