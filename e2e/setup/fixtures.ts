// E2E fixtures + seed for the dedicated `e2e-suite` gym in the DEV Supabase project.
// Idempotent: re-runnable. Resets the per-run mutable state (memberships, class
// instances + their bookings, credits) so every run starts clean, while keeping
// the box + users + signatures stable.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  throw new Error('E2E seed needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from .env.local).')
}

// Service-role client — bypasses RLS + column grants. NEVER point this at prod.
export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export const GYM = { slug: 'e2e-suite', name: 'E2E Suite Gym', timezone: 'Asia/Dubai' }

export const USERS = {
  athlete: { email: 'e2e.athlete@example.test', role: 'athlete', name: 'E2E Athlete' },
  owner: { email: 'e2e.owner@example.test', role: 'owner', name: 'E2E Owner' },
  coach: { email: 'e2e.coach@example.test', role: 'coach', name: 'E2E Coach' },
} as const

export type RoleKey = keyof typeof USERS
export const authFile = (k: RoleKey) => `e2e/.auth/${k}.json`

export const CLASS_NAME = 'E2E Morning WOD'
export const PACKAGE_NAME = 'E2E 10-Class Pack'

async function ensureBox(): Promise<string> {
  const { data: existing } = await admin.from('boxes').select('id').eq('slug', GYM.slug).maybeSingle()
  if (existing?.id) return existing.id as string
  const { data, error } = await admin
    .from('boxes')
    .insert({ name: GYM.name, slug: GYM.slug, timezone: GYM.timezone })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed box: ${error?.message}`)
  return data.id as string
}

async function ensureUser(email: string, role: string, name: string, boxId: string): Promise<string> {
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  let id = existing?.id as string | undefined
  if (!id) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (created.data?.user) {
      id = created.data.user.id
    } else {
      const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      id = list.data?.users.find((u) => u.email === email)?.id
    }
    if (!id) throw new Error(`ensureUser ${email}: ${created.error?.message ?? 'not found'}`)
  }
  const { error } = await admin
    .from('profiles')
    .upsert({ id, box_id: boxId, role, full_name: name, email }, { onConflict: 'id' })
  if (error) throw new Error(`ensureUser profile ${email}: ${error.message}`)
  return id
}

// Athletes are bounced to /sign-waiver unless they have a current waiver + terms +
// PAR-Q signature (owners/coaches are exempt). Seed those rows so the athlete reaches
// the dashboard. The gates only check row existence for the current version.
async function signAgreements(boxId: string, athleteId: string, name: string) {
  const { data: terms } = await admin.from('gym_terms').select('version').eq('box_id', boxId).maybeSingle()
  const { data: parq } = await admin.from('gym_parq').select('version').eq('box_id', boxId).maybeSingle()

  const { data: w } = await admin.from('waiver_signatures').select('id').eq('box_id', boxId).eq('athlete_id', athleteId).maybeSingle()
  if (!w) await admin.from('waiver_signatures').insert({ box_id: boxId, athlete_id: athleteId, full_name: name })

  if (terms) {
    const { data: ts } = await admin.from('terms_signatures').select('id')
      .eq('box_id', boxId).eq('athlete_id', athleteId).eq('terms_version', terms.version).maybeSingle()
    if (!ts) await admin.from('terms_signatures').insert({ box_id: boxId, athlete_id: athleteId, full_name: name, terms_version: terms.version })
  }
  if (parq) {
    const { data: pr } = await admin.from('parq_responses').select('id')
      .eq('box_id', boxId).eq('athlete_id', athleteId).eq('parq_version', parq.version).maybeSingle()
    if (!pr) await admin.from('parq_responses').insert({ box_id: boxId, athlete_id: athleteId, parq_version: parq.version, answers: {}, has_yes: false, full_name: name })
  }
}

export interface SeedResult {
  boxId: string
  ids: Record<RoleKey, string>
}

export async function seed(): Promise<SeedResult> {
  const boxId = await ensureBox()

  const ids = {} as Record<RoleKey, string>
  for (const key of Object.keys(USERS) as RoleKey[]) {
    const u = USERS[key]
    ids[key] = await ensureUser(u.email, u.role, u.name, boxId)
  }

  await signAgreements(boxId, ids.athlete, USERS.athlete.name)

  // Athlete: exactly one PAID membership (free-booking entitlement).
  const today = new Date().toISOString().slice(0, 10)
  await admin.from('memberships').delete().eq('box_id', boxId).eq('athlete_id', ids.athlete)
  const { error: mErr } = await admin.from('memberships').insert({
    box_id: boxId, athlete_id: ids.athlete, plan_name: 'E2E Unlimited', start_date: today, payment_status: 'paid',
  })
  if (mErr) throw new Error(`seed membership: ${mErr.message}`)

  // Fresh class: wipe instances (cascades bookings) → ensure template → one TODAY,
  // a couple of hours out so it's both bookable (future) and on today's whiteboard.
  await admin.from('class_instances').delete().eq('box_id', boxId)
  let templateId: string
  const { data: tmpl } = await admin.from('class_templates').select('id').eq('box_id', boxId).eq('name', CLASS_NAME).maybeSingle()
  if (tmpl?.id) {
    templateId = tmpl.id as string
  } else {
    const { data, error } = await admin.from('class_templates')
      .insert({ box_id: boxId, name: CLASS_NAME, weekday: new Date().getDay(), start_time: '18:00', capacity: 12, coach_id: ids.coach })
      .select('id').single()
    if (error || !data) throw new Error(`seed template: ${error?.message}`)
    templateId = data.id as string
  }
  // 30 min out: future (bookable) and still today in the gym tz so it shows on
  // the whiteboard (which lists only today's classes).
  const startsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const { error: ciErr } = await admin.from('class_instances').insert({
    box_id: boxId, template_id: templateId, coach_id: ids.coach,
    starts_at: startsAt, capacity: 12, status: 'scheduled', duration_minutes: 60,
  })
  if (ciErr) throw new Error(`seed class instance: ${ciErr.message}`)

  // Athlete: clean credit slate (the Stripe pack spec grants its own).
  await admin.from('package_credits').delete().eq('box_id', boxId).eq('athlete_id', ids.athlete)

  return { boxId, ids }
}

// Authenticate without an inbox: admin generateLink → the real /auth/confirm route.
export async function magicTokenFor(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = data?.properties?.hashed_token
  if (error || !tokenHash) throw new Error(`generateLink ${email}: ${error?.message ?? 'no token'}`)
  return tokenHash
}
