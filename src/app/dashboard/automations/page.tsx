import { requireOwnerPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { AutomationsList, type AutomationRow } from './_components/automations-list'

export default async function AutomationsPage() {
  const { supabase, profile, boxName } = await requireOwnerPage()

  const { data: autos } = await supabase.from('automations').select('id, name, trigger_type, trigger_days, enabled, channel').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const { data: runs } = await supabase.from('automation_runs').select('automation_id').eq('box_id', profile.box_id)
  const counts = new Map<string, number>()
  for (const r of (runs ?? []) as { automation_id: string }[]) counts.set(r.automation_id, (counts.get(r.automation_id) ?? 0) + 1)
  const rows = ((autos ?? []) as Omit<AutomationRow, 'sent_count'>[]).map((a) => ({ ...a, sent_count: counts.get(a.id) ?? 0 }))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="automations" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Automations</h1>
          <Link href="/dashboard/automations/new" style={{ padding: '8px 14px', background: '#111', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>New automation</Link>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <AutomationsList rows={rows} />
          </div>
        </div>
      </div>
    </div>
  )
}
