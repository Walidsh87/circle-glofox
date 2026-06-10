import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { SequencesList, type SequenceRow } from './_components/sequences-list'

export default async function SequencesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: seqs } = await supabase.from('sequences').select('id, name, trigger_type, trigger_days, steps, enabled').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const { data: enrollments } = await supabase.from('sequence_enrollments').select('sequence_id, status').eq('box_id', profile.box_id)
  const { data: sendRows } = await supabase.from('sequence_sends').select('sequence_enrollments(sequence_id)').eq('box_id', profile.box_id)

  const activeBySeq = new Map<string, number>()
  for (const e of (enrollments ?? []) as { sequence_id: string; status: string }[]) {
    if (e.status === 'active') activeBySeq.set(e.sequence_id, (activeBySeq.get(e.sequence_id) ?? 0) + 1)
  }
  // per-sequence sent count via the sends → enrollment FK embedding.
  const sentBySeq = new Map<string, number>()
  for (const r of (sendRows ?? []) as { sequence_enrollments: { sequence_id: string } | { sequence_id: string }[] | null }[]) {
    const se = Array.isArray(r.sequence_enrollments) ? r.sequence_enrollments[0] : r.sequence_enrollments
    if (se?.sequence_id) sentBySeq.set(se.sequence_id, (sentBySeq.get(se.sequence_id) ?? 0) + 1)
  }

  const rows = ((seqs ?? []) as { id: string; name: string; trigger_type: SequenceRow['trigger_type']; trigger_days: number | null; steps: unknown[]; enabled: boolean }[]).map((s) => ({
    id: s.id, name: s.name, trigger_type: s.trigger_type, trigger_days: s.trigger_days, enabled: s.enabled,
    step_count: Array.isArray(s.steps) ? s.steps.length : 0,
    active_count: activeBySeq.get(s.id) ?? 0,
    sent_count: sentBySeq.get(s.id) ?? 0,
  }))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="sequences" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Sequences</h1>
          <Link href="/dashboard/sequences/new" style={{ padding: '8px 14px', background: '#111', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>New sequence</Link>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 680 }}>
            <SequencesList rows={rows} />
          </div>
        </div>
      </div>
    </div>
  )
}
