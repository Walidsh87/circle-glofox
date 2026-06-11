import { requireOwnerPage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
import { AutomationForm } from '../_components/automation-form'

export default async function NewAutomationPage() {
  const { supabase, profile, boxName } = await requireOwnerPage()

  const { data: waTpls } = await supabase.from('wa_templates').select('id, name, body_preview, var_count').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const waTemplates = (waTpls ?? []) as { id: string; name: string; body_preview: string; var_count: number }[]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="automations" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>New automation</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <AutomationForm waTemplates={waTemplates} initial={{ id: null, name: '', triggerType: 'no_checkin', triggerDays: 14, subject: '', bodyBlocks: [], channel: 'email', waTemplateId: null, waVarValues: {} }} />
        </div>
      </div>
    </div>
  )
}
