import { requireManagerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { AutomationForm } from '../_components/automation-form'

export default async function NewAutomationPage() {
  const { supabase, profile, boxName } = await requireManagerPage()

  const { data: waTpls } = await supabase.from('wa_templates').select('id, name, body_preview, var_count').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const waTemplates = (waTpls ?? []) as { id: string; name: string; body_preview: string; var_count: number }[]

  return (
    <DashboardShell
      active="automations"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="New automation"
    >
      <AutomationForm waTemplates={waTemplates} initial={{ id: null, name: '', triggerType: 'no_checkin', triggerDays: 14, subject: '', bodyBlocks: [], channel: 'email', waTemplateId: null, waVarValues: {} }} />
    </DashboardShell>
  )
}
