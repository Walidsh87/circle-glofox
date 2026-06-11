// DEV/TESTING ONLY — sets a password on an existing account via the service role.
// Usage: node --env-file=.env.local scripts/set-password.mjs <email> <password>
import { createClient } from '@supabase/supabase-js'

const [, , email, password] = process.argv
if (!email || !password) {
  console.error('Usage: node --env-file=.env.local scripts/set-password.mjs <email> <password>')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Pick a password of at least 8 characters.')
  process.exit(1)
}

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: rows, error: lookupError } = await service
  .from('profiles')
  .select('id, role, full_name')
  .eq('email', email.toLowerCase())
if (lookupError || !rows?.length) {
  console.error(`No profile found for ${email}: ${lookupError?.message ?? 'not found'}`)
  process.exit(1)
}
// Demo seeds duplicated some emails across roles — prefer the highest-privilege row
// (that's the id with a real auth user behind it for the account owner).
const rank = { owner: 0, coach: 1, athlete: 2 }
const profile = [...rows].sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9))[0]
if (rows.length > 1) console.log(`Note: ${rows.length} profiles share this email; using the ${profile.role} row.`)

const { error } = await service.auth.admin.updateUserById(profile.id, { password })
if (error) {
  console.error(`Failed to set password: ${error.message}`)
  process.exit(1)
}
console.log(`Password set for ${profile.full_name ?? email} (${profile.role}).`)
