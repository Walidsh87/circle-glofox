import type { SupabaseClient } from '@supabase/supabase-js'

// Member-JWT endpoint core for the mobile calendar-sync card (#81). Mirrors the web
// setCalendarToken action: profiles has no UPDATE RLS, so the write is service-role,
// row pinned to the caller (athleteId + boxId forced from the verified JWT). The token
// is server-minted (crypto.randomUUID) so feed-URL entropy never depends on the client;
// 'generate' also serves as regenerate (the unique index holds, the old token simply
// stops resolving).

export type CalendarTokenResult =
  | { ok: true; token: string | null }
  | { ok: false; code: 'internal'; message: string }

export async function setCalendarTokenViaApi(
  service: SupabaseClient,
  athleteId: string,
  boxId: string,
  action: 'generate' | 'disable',
): Promise<CalendarTokenResult> {
  const calendar_token = action === 'generate' ? crypto.randomUUID() : null
  const { error } = await service
    .from('profiles')
    .update({ calendar_token })
    .eq('id', athleteId)
    .eq('box_id', boxId)
  if (error) {
    console.error('[setCalendarTokenViaApi] update error:', error)
    return { ok: false, code: 'internal', message: 'Could not update your calendar feed. Please try again.' }
  }
  return { ok: true, token: calendar_token }
}
