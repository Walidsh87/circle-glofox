import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js'
import { env } from '@/env'

/**
 * Service-role client — bypasses RLS. Constructed per call (never a module
 * singleton) so call sites create it only after their authz checks pass.
 */
export function createServiceClient(options?: SupabaseClientOptions<'public'>) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
}
