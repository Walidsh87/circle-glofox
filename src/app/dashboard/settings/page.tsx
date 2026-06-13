import { requireOwnerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { SettingsForm } from './_components/settings-form'
import { env } from '@/env'
import { TvDisplayCard } from './_components/tv-display-card'
import { CheckinQrCard } from './_components/checkin-qr-card'
import { BookingPolicyCard } from './_components/booking-policy-card'
import { RamadanCard } from './_components/ramadan-card'
import { upcomingRamadanWindow } from '@/lib/hijri'
import { todayInTimezone } from '@/lib/timezone'
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
      .select('trn, legal_name, billing_address, tv_token, checkin_token, booking_close_minutes, late_cancel_hours, roster_public, ramadan_start, ramadan_end')
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

  const ramadanSuggested = upcomingRamadanWindow(todayInTimezone(boxes?.timezone ?? 'Asia/Dubai'))

  return (
    <DashboardShell
      active="settings"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxes?.name ?? ''}
      title="Settings"
    >
      <div className="max-w-[480px]">
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
        <CheckinQrCard link={box?.checkin_token ? `${env.NEXT_PUBLIC_APP_URL}/checkin/${box.checkin_token}` : null} />
        <BookingPolicyCard closeMinutes={box?.booking_close_minutes ?? 0} lateCancelHours={box?.late_cancel_hours ?? 0} rosterPublic={box?.roster_public === true} />
        <RamadanCard ramadanStart={box?.ramadan_start ?? null} ramadanEnd={box?.ramadan_end ?? null} suggested={ramadanSuggested} />
        <LeadWidgetCard snippet={leadSnippet} />
        <ScheduleWidgetCard snippet={scheduleSnippet} />
        <ChecklistEditor items={checklistItems} />
      </div>
    </DashboardShell>
  )
}
