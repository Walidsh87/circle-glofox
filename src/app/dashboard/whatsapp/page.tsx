import { requireManagerPage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="whatsapp" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>WhatsApp</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <WaTemplatesManager templates={templates} />
            <WaComposeForm templates={templates} tags={tags} configured={waConfigured()} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>History</h2>
            <WaList rows={rows} />
          </div>
        </div>
      </div>
    </div>
  )
}
