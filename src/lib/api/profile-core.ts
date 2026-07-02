import type { SupabaseClient } from '@supabase/supabase-js'
import { validateOwnProfile } from '@/app/dashboard/members/[memberId]/_lib/own-profile-validation'

// Member-JWT endpoint core for the member's own editable details (phone + emergency contact + blood
// type + allergies). Mirrors the web updateOwnProfile action (src/app/dashboard/members/[memberId]/
// _actions/update-own-profile.ts) — same validator, same 5 columns, service client, row pinned to the
// caller. profiles has NO UPDATE RLS policy, and the medical columns aren't in the `authenticated`
// SELECT grant (column-allowlist), so BOTH read and write go through the service client here (the
// caller/route forces athleteId + boxId from the verified JWT — no id ever comes from the body).
// DOB / national ID are staff-captured, not self-editable, so they are intentionally out of scope.

export type OwnProfilePii = {
  phone: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  blood_type: string | null
  allergies: string | null
  language: 'en' | 'ar'
}

export async function getOwnProfileViaApi(
  service: SupabaseClient,
  athleteId: string,
  boxId: string,
): Promise<OwnProfilePii | null> {
  const { data } = await service
    .from('profiles')
    .select('phone, emergency_contact_name, emergency_contact_phone, blood_type, allergies, language')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .maybeSingle()
  if (!data) return null
  return {
    phone: (data.phone as string | null) ?? null,
    emergency_contact_name: (data.emergency_contact_name as string | null) ?? null,
    emergency_contact_phone: (data.emergency_contact_phone as string | null) ?? null,
    blood_type: (data.blood_type as string | null) ?? null,
    allergies: (data.allergies as string | null) ?? null,
    language: data.language === 'ar' ? 'ar' : 'en',
  }
}

export type ProfileUpdateResult =
  | { ok: true }
  | { ok: false; code: 'validation_error' | 'internal'; message: string }

// Present-only patch: `undefined` = key absent from the body = leave the stored column untouched;
// `null` = explicit clear. This is what makes the mobile language toggle (which PATCHes
// `{language}` alone) safe — it must never null the other five columns.
export type OwnProfilePatch = {
  phone?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  bloodType?: string | null
  allergies?: string | null
}

// Maps a parsed JSON body (already known to be a plain object) to the patch fields.
// Present non-string values count as an explicit clear (null), matching the old boundary rule.
export function pickPatchFields(b: Record<string, unknown>): OwnProfilePatch {
  const opt = (k: string): string | null | undefined =>
    k in b ? (typeof b[k] === 'string' ? (b[k] as string) : null) : undefined
  return {
    phone: opt('phone'),
    emergencyContactName: opt('emergency_contact_name'),
    emergencyContactPhone: opt('emergency_contact_phone'),
    bloodType: opt('blood_type'),
    allergies: opt('allergies'),
  }
}

// `language` (#71 mobile Arabic): optional 6th field, same present-only rule. The column is
// NOT NULL DEFAULT 'en' (mig 067), so an explicit null is rejected, not written.
export async function updateOwnProfileViaApi(
  service: SupabaseClient,
  athleteId: string,
  boxId: string,
  input: OwnProfilePatch,
  language?: unknown,
): Promise<ProfileUpdateResult> {
  const trim = (v: string | null | undefined): string | null | undefined =>
    v === undefined ? undefined : v?.trim() || null
  const trimmed: OwnProfilePatch = {
    phone: trim(input.phone),
    emergencyContactName: trim(input.emergencyContactName),
    emergencyContactPhone: trim(input.emergencyContactPhone),
    bloodType: trim(input.bloodType),
    allergies: trim(input.allergies),
  }
  // Absent fields validate as null (all five columns are nullable), so only provided values can fail.
  const vErr = validateOwnProfile({
    phone: trimmed.phone ?? null,
    emergencyContactName: trimmed.emergencyContactName ?? null,
    emergencyContactPhone: trimmed.emergencyContactPhone ?? null,
    bloodType: trimmed.bloodType ?? null,
    allergies: trimmed.allergies ?? null,
  })
  if (vErr) return { ok: false, code: 'validation_error', message: vErr }
  if (language !== undefined && language !== 'en' && language !== 'ar') {
    return { ok: false, code: 'validation_error', message: 'Language must be "en" or "ar".' }
  }

  const update: Record<string, string | null> = {}
  if (trimmed.phone !== undefined) update.phone = trimmed.phone
  if (trimmed.emergencyContactName !== undefined) update.emergency_contact_name = trimmed.emergencyContactName
  if (trimmed.emergencyContactPhone !== undefined) update.emergency_contact_phone = trimmed.emergencyContactPhone
  if (trimmed.bloodType !== undefined) update.blood_type = trimmed.bloodType
  if (trimmed.allergies !== undefined) update.allergies = trimmed.allergies
  if (language !== undefined) update.language = language
  if (Object.keys(update).length === 0) return { ok: true } // nothing provided — no-op

  const { error } = await service
    .from('profiles')
    .update(update)
    .eq('id', athleteId)
    .eq('box_id', boxId)
  if (error) {
    console.error('[updateOwnProfileViaApi] update error:', error)
    return { ok: false, code: 'internal', message: 'Could not save your details. Please try again.' }
  }
  return { ok: true }
}
