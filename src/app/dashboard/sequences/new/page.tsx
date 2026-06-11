import { requireManagerPage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
import { SequenceForm } from '../_components/sequence-form'

export default async function NewSequencePage() {
  const { profile, boxName } = await requireManagerPage()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="sequences" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>New sequence</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <SequenceForm initial={{ id: null, name: '', triggerType: 'joined', triggerDays: 0, steps: [] }} />
        </div>
      </div>
    </div>
  )
}
