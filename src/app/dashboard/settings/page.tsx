import { requireOwnerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { SettingsForm } from './_components/settings-form'
import { env } from '@/env'
import { TokenLinkCard } from './_components/token-link-card'
import { setTvToken } from './_actions/set-tv-token'
import { setCheckinToken } from './_actions/set-checkin-token'
import { BookingPolicyCard } from './_components/booking-policy-card'
import { RamadanCard } from './_components/ramadan-card'
import { upcomingRamadanWindow } from '@/lib/hijri'
import { todayInTimezone } from '@/lib/timezone'
import { EmbedSnippetCard } from './_components/embed-snippet-card'
import { ChecklistEditor, type EditorItem } from './_components/checklist-editor'
import { ApiKeysCard, type ApiKeyRow } from './_components/api-keys-card'
import { WebhooksCard, type WebhookSubRow } from './_components/webhooks-card'
import { createServiceClient } from '@/lib/supabase/service'

export default async function SettingsPage() {
  const { supabase, profile, box: boxes } = await requireOwnerPage()

  // Don't fetch the raw secret key — query a count of rows where it's set instead.
  // The boolean is all the UI needs; the secret never leaves the database.
  const [{ data: box }, { count: stripeConnectedCount }, { data: checklistRows }] = await Promise.all([
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
    supabase.from('checklist_items').select('id, label, kind').eq('box_id', profile.box_id).order('position', { ascending: true }),
  ])
  const stripeConnected = (stripeConnectedCount ?? 0) > 0

  const leadSnippet = boxes?.slug
    ? `<iframe src="${env.NEXT_PUBLIC_APP_URL}/embed/lead/${boxes.slug}" width="100%" height="520" style="border:0" title="${boxes.name} — get started"></iframe>`
    : null

  const scheduleSnippet = boxes?.slug
    ? `<iframe src="${env.NEXT_PUBLIC_APP_URL}/embed/schedule/${boxes.slug}" width="100%" height="640" style="border:0" title="${boxes.name} — class schedule"></iframe>`
    : null

  const checklistItems = (checklistRows ?? []) as EditorItem[]

  const ramadanSuggested = upcomingRamadanWindow(todayInTimezone(boxes?.timezone ?? 'Asia/Dubai'))

  // api_keys + webhook_subscriptions are service-role-only (RLS, no policies) —
  // fetch with the service client, box-scoped.
  const service = createServiceClient()
  const [{ data: apiKeys }, { data: webhookSubs }] = await Promise.all([
    service
      .from('api_keys')
      .select('id, label, key_prefix, scopes, last_used_at, revoked_at, created_at')
      .eq('box_id', profile.box_id)
      .order('created_at', { ascending: false }),
    service
      .from('webhook_subscriptions')
      .select('id, url, event_types, active, created_at')
      .eq('box_id', profile.box_id)
      .order('created_at', { ascending: false }),
  ])

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
        <TokenLinkCard
          title="TV display"
          description="A public, read-only board for a gym-floor TV — today's WOD, the live leaderboard, and PRs. Anyone with the link can view it, so keep it private; regenerate to revoke the old one."
          link={box?.tv_token ? `${env.NEXT_PUBLIC_APP_URL}/tv/${box.tv_token}` : null}
          action={setTvToken}
          enableLabel="Generate link"
        />
        <TokenLinkCard
          title="Door check-in QR"
          description="Members scan a printed QR at the door to check themselves into booked classes (opens 60 min before class). Regenerate to invalidate old posters and shared links."
          link={box?.checkin_token ? `${env.NEXT_PUBLIC_APP_URL}/checkin/${box.checkin_token}` : null}
          action={setCheckinToken}
          enableLabel="Enable door check-in"
          extraLink={{ href: '/dashboard/settings/checkin-poster', label: 'Print poster' }}
        />
        <BookingPolicyCard closeMinutes={box?.booking_close_minutes ?? 0} lateCancelHours={box?.late_cancel_hours ?? 0} rosterPublic={box?.roster_public === true} />
        <RamadanCard ramadanStart={box?.ramadan_start ?? null} ramadanEnd={box?.ramadan_end ?? null} suggested={ramadanSuggested} />
        <EmbedSnippetCard
          title="Lead-capture widget"
          description="Paste this on your website to collect leads straight into your CRM. New submissions appear in your Lifecycle board."
          snippet={leadSnippet}
        />
        <EmbedSnippetCard
          title="Schedule widget"
          description="Embed your public class timetable on your website. Read-only; visitors click “Book / Log in” to reserve."
          snippet={scheduleSnippet}
        />
        <ChecklistEditor items={checklistItems} />
        <ApiKeysCard keys={(apiKeys ?? []) as ApiKeyRow[]} apiConfigured={!!env.API_KEY_PEPPER} />
        <WebhooksCard subs={(webhookSubs ?? []) as WebhookSubRow[]} />
      </div>
    </DashboardShell>
  )
}
