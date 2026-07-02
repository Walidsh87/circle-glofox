import type { SupabaseClient } from '@supabase/supabase-js'
import { validateOwnProfile, type OwnProfileInput } from '@/app/dashboard/members/[memberId]/_lib/own-profile-validation'

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

// `language` (#71 mobile Arabic): optional 6th field — the mobile language toggle PATCHes it.
// `undefined` = key absent from the body = leave the stored preference untouched (the PATCH is
// otherwise a full replace of the 5 PII fields, and the toggle sends language alone). The column
// is NOT NULL DEFAULT 'en' (mig 067), so an explicit null is rejected, not written.
export async function updateOwnProfileViaApi(
  service: SupabaseClient,
  athleteId: string,
  boxId: string,
  input: OwnProfileInput,
  language?: unknown,
): Promise<ProfileUpdateResult> {
  const trimmed: OwnProfileInput = {
    phone: input.phone?.trim() || null,
    emergencyContactName: input.emergencyContactName?.trim() || null,
    emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
    bloodType: input.bloodType?.trim() || null,
    allergies: input.allergies?.trim() || null,
  }
  const vErr = validateOwnProfile(trimmed)
  if (vErr) return { ok: false, code: 'validation_error', message: vErr }
  if (language !== undefined && language !== 'en' && language !== 'ar') {
    return { ok: false, code: 'validation_error', message: 'Language must be "en" or "ar".' }
  }

  const update: Record<string, string | null> = {
    phone: trimmed.phone,
    emergency_contact_name: trimmed.emergencyContactName,
    emergency_contact_phone: trimmed.emergencyContactPhone,
    blood_type: trimmed.bloodType,
    allergies: trimmed.allergies,
  }
  if (language !== undefined) update.language = language

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
