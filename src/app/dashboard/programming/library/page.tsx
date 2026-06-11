import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { LibraryList } from '../_components/library-list'
import type { TemplateExisting } from '../_components/template-form'

export default async function LibraryPage() {
  const { supabase, profile, boxName } = await requireStaffPage()

  const { data: templates } = await supabase
    .from('workout_templates')
    .select('id, title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets')
    .eq('box_id', profile.box_id)
    .order('title')

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="programming" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0, gap: 12 }}>
          <Link href="/dashboard/programming" style={{ fontSize: 13, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>← Calendar</Link>
          <span style={{ color: 'var(--c-border)' }}>/</span>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>WOD Library</h1>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <LibraryList templates={(templates ?? []) as NonNullable<TemplateExisting>[]} />
        </div>
      </div>
    </div>
  )
}
