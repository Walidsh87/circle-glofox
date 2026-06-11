import { requireOwnerPage } from '@/lib/auth/page-guards'
import { notFound } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SequenceForm } from '../_components/sequence-form'
import type { SequenceStep } from '@/lib/sequences'
import type { TriggerType } from '@/lib/automations'

export default async function EditSequencePage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { supabase, profile, boxName } = await requireOwnerPage()

  const { data: s } = await supabase.from('sequences').select('id, name, trigger_type, trigger_days, steps').eq('id', id).eq('box_id', profile.box_id).single()
  if (!s) notFound()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="sequences" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Edit sequence</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <SequenceForm initial={{
            id: s.id,
            name: s.name,
            triggerType: s.trigger_type as TriggerType,
            triggerDays: s.trigger_days,
            steps: (s.steps as SequenceStep[] | null) ?? [],
          }} />
        </div>
      </div>
    </div>
  )
}
