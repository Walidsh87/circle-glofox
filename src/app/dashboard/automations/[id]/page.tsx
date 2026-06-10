import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { AutomationForm } from '../_components/automation-form'
import type { Block } from '@/lib/email-blocks'
import type { TriggerType } from '@/lib/automations'

export default async function EditAutomationPage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: a } = await supabase.from('automations').select('id, name, trigger_type, trigger_days, subject, body_blocks, channel, wa_template_id, wa_var_values').eq('id', id).eq('box_id', profile.box_id).single()
  if (!a) notFound()

  const { data: waTpls } = await supabase.from('wa_templates').select('id, name, body_preview, var_count').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const waTemplates = (waTpls ?? []) as { id: string; name: string; body_preview: string; var_count: number }[]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="automations" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Edit automation</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <AutomationForm waTemplates={waTemplates} initial={{
            id: a.id,
            name: a.name,
            triggerType: a.trigger_type as TriggerType,
            triggerDays: a.trigger_days,
            subject: a.subject,
            bodyBlocks: (a.body_blocks as Block[] | null) ?? [],
            channel: (a.channel as 'email' | 'whatsapp') ?? 'email',
            waTemplateId: (a.wa_template_id as string | null) ?? null,
            waVarValues: (a.wa_var_values as Record<string, string> | null) ?? {},
          }} />
        </div>
      </div>
    </div>
  )
}
