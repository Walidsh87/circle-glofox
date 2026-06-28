// One-command local E2E database: boots the Supabase stack (Docker), writes
// .env.test from its status, and applies the app schema + migrations.
// Run once before `npm run test:e2e`. Idempotent (safe to re-run).
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

console.log('▸ Starting local Supabase stack (Docker)…')
execSync('npx --yes supabase start', { stdio: 'inherit' })

const envOut = execSync('npx --yes supabase status -o env', { encoding: 'utf8' })
const get = (k) => (envOut.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm')) || [])[1]
const apiUrl = get('API_URL')
const anon = get('ANON_KEY')
const service = get('SERVICE_ROLE_KEY')
const dbUrl = get('DB_URL')
if (!apiUrl || !anon || !service || !dbUrl) {
  throw new Error('Could not parse `supabase status -o env`.')
}

writeFileSync(
  '.env.test',
  [
    '# Local Supabase stack — regenerate with: npm run e2e:db',
    '# Standard PUBLIC local-dev demo keys (identical on every machine; not secret).',
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
    `SUPABASE_SERVICE_ROLE_KEY=${service}`,
    'NEXT_PUBLIC_APP_URL=http://localhost:3001',
    'RESEND_API_KEY=e2e_placeholder_resend_key',
    'CRON_SECRET=e2e_cron_secret_0123456789',
    'PORTAL_SIGN_SECRET=e2e_portal_sign_secret_0123456789_abcdef',
    '',
  ].join('\n'),
)
console.log('▸ Wrote .env.test')

execSync('node scripts/e2e-apply-schema.mjs', {
  stdio: 'inherit',
  env: { ...process.env, E2E_DB_URL: dbUrl },
})

console.log('\n✓ Local E2E database ready. Run:  npm run test:e2e')
