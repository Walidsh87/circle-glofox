import { requireOwnerPage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
import { SettingsForm } from './_components/settings-form'
import { env } from '@/env'
import { TvDisplayCard } from './_components/tv-display-card'
import { BookingPolicyCard } from './_components/booking-policy-card'
import { LeadWidgetCard } from './_components/lead-widget-card'
import { ScheduleWidgetCard } from './_components/schedule-widget-card'
import { ChecklistEditor, type EditorItem } from './_components/checklist-editor'

export default async function SettingsPage() {
  const { supabase, profile, box: boxes } = await requireOwnerPage()

  // Don't fetch the raw secret key — query a count of rows where it's set instead.
  // The boolean is all the UI needs; the secret never leaves the database.
  const [{ data: box }, { count: stripeConnectedCount }] = await Promise.all([
    supabase
      .from('boxes')
      .select('trn, legal_name, billing_address, tv_token, booking_close_minutes, late_cancel_hours')
      .eq('id', profile.box_id)
      .single(),
    supabase
      .from('boxes')
      .select('id', { count: 'exact', head: true })
      .eq('id', profile.box_id)
      .not('stripe_secret_key', 'is', null),
  ])
  const stripeConnected = (stripeConnectedCount ?? 0) > 0

  const leadSnippet = boxes?.slug
    ? `<iframe src="${env.NEXT_PUBLIC_APP_URL}/embed/lead/${boxes.slug}" width="100%" height="520" style="border:0" title="${boxes.name} — get started"></iframe>`
    : null

  const scheduleSnippet = boxes?.slug
    ? `<iframe src="${env.NEXT_PUBLIC_APP_URL}/embed/schedule/${boxes.slug}" width="100%" height="640" style="border:0" title="${boxes.name} — class schedule"></iframe>`
    : null

  const { data: checklistRows } = await supabase.from('checklist_items').select('id, label, kind').eq('box_id', profile.box_id).order('position', { ascending: true })
  const checklistItems = (checklistRows ?? []) as EditorItem[]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="settings" userName={profile.full_name!} userRole={profile.role} boxName={boxes?.name ?? ''} />

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
              initialTrn={box?.trn ?? ''}
              initialLegalName={box?.legal_name ?? ''}
              initialBillingAddress={box?.billing_address ?? ''}
              stripeConnected={stripeConnected}
            />
            <TvDisplayCard link={box?.tv_token ? `${env.NEXT_PUBLIC_APP_URL}/tv/${box.tv_token}` : null} />
            <BookingPolicyCard closeMinutes={box?.booking_close_minutes ?? 0} lateCancelHours={box?.late_cancel_hours ?? 0} />
            <LeadWidgetCard snippet={leadSnippet} />
            <ScheduleWidgetCard snippet={scheduleSnippet} />
            <ChecklistEditor items={checklistItems} />
          </div>
        </div>
      </div>
    </div>
  )
}
