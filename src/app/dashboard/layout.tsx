import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <MfaGate><WaiverGate>{children}</WaiverGate></MfaGate>
}

// Enrolled-but-unverified sessions (aal1 with aal2 available) must complete the
// TOTP challenge before touching anything under /dashboard.
async function MfaGate({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? ''
  if (pathname === '/dashboard/mfa') return <>{children}</>

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <>{children}</>

  // Fail-open on error: an auth-service blip must never lock the gym out.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
    redirect('/dashboard/mfa')
  }
  return <>{children}</>
}

async function WaiverGate({
  children,
}: {
  children: React.ReactNode
}) {
  // Skip gate on the signing page itself to prevent redirect loop
  const pathname = (await headers()).get('x-pathname') ?? ''
  // /dashboard/mfa must stay reachable or the two gates ping-pong an
  // enrolled-but-unsigned athlete (API-only state) in a redirect loop.
  if (pathname === '/dashboard/sign-waiver' || pathname === '/dashboard/mfa') {
    return <>{children}</>
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Middleware already redirects unauthenticated users — guard here is just safety
  if (!user) return <>{children}</>

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id')
    .eq('id', user.id)
    .maybeSingle()

  // Owners and coaches are exempt from the waiver gate
  if (!profile || profile.role !== 'athlete') {
    return <>{children}</>
  }

  const [{ data: waiverSig }, { data: terms }, { data: parqDoc }] = await Promise.all([
    supabase
      .from('waiver_signatures')
      .select('id')
      .eq('box_id', profile.box_id)
      .eq('athlete_id', user.id)
      .maybeSingle(),
    supabase
      .from('gym_terms')
      .select('version')
      .eq('box_id', profile.box_id)
      .maybeSingle(),
    supabase
      .from('gym_parq')
      .select('version')
      .eq('box_id', profile.box_id)
      .maybeSingle(),
  ])

  const currentTermsVersion = terms?.version ?? 1
  const [{ data: termsSig }, { data: parqResp }] = await Promise.all([
    supabase
      .from('terms_signatures')
      .select('id')
      .eq('box_id', profile.box_id)
      .eq('athlete_id', user.id)
      .eq('terms_version', currentTermsVersion)
      .maybeSingle(),
    parqDoc
      ? supabase
          .from('parq_responses')
          .select('id')
          .eq('box_id', profile.box_id)
          .eq('athlete_id', user.id)
          .eq('parq_version', parqDoc.version)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Missing gym_parq row (trigger/backfill gap) must never lock athletes out.
  const parqDone = !parqDoc || !!parqResp

  if (!waiverSig || !termsSig || !parqDone) {
    redirect('/dashboard/sign-waiver')
  }

  return <>{children}</>
}
