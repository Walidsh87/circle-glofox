import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SettingsForm } from './_components/settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name, timezone, slug)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')

  const boxesRaw = profile.boxes
  const boxes = (Array.isArray(boxesRaw) ? boxesRaw[0] : boxesRaw) as { name: string; timezone: string; slug: string | null } | null

  const { data: box } = await supabase
    .from('boxes')
    .select('stripe_secret_key')
    .eq('id', profile.box_id)
    .single()
  const stripeConnected = !!(box?.stripe_secret_key)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="settings" userName={profile.full_name} userRole={profile.role} boxName={boxes?.name ?? ''} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Settings
          </h1>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 480 }}>
            <SettingsForm
              initialName={boxes?.name ?? ''}
              initialSlug={boxes?.slug ?? ''}
              initialTimezone={boxes?.timezone ?? 'Asia/Dubai'}
              stripeConnected={stripeConnected}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
