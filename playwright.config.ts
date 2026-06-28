import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { loadEnvConfig } from '@next/env'

// E2E env: prefer .env.test (the local Supabase stack written by `npm run e2e:db`);
// fall back to .env.local. Loading .env.test into process.env makes the seed/auth
// (this process) and the app (webServer, below) share ONE database.
if (existsSync('.env.test')) {
  for (const raw of readFileSync('.env.test', 'utf8').split('\n')) {
    if (raw.trim().startsWith('#')) continue
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} else {
  loadEnvConfig(process.cwd())
}

const PORT = Number(process.env.E2E_PORT ?? 3001)
const baseURL = `http://localhost:${PORT}`

// Hand the resolved Supabase env to `next dev` so the app talks to the SAME DB the
// seed/auth use (Next does not override vars already present in process.env).
const appEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  NEXT_PUBLIC_APP_URL: baseURL,
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? 'e2e_placeholder_resend_key',
  CRON_SECRET: process.env.CRON_SECRET ?? 'e2e_cron_secret_0123456789',
  PORTAL_SIGN_SECRET: process.env.PORTAL_SIGN_SECRET ?? 'e2e_portal_sign_secret_0123456789_abcdef',
}

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  // CI runners are slower and `next dev` lazily compiles each route on first hit —
  // give first navigations room so they don't trip the default timeouts.
  timeout: isCI ? 90_000 : 30_000,
  expect: { timeout: isCI ? 20_000 : 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    env: appEnv,
    url: baseURL,
    timeout: isCI ? 180_000 : 120_000,
    reuseExistingServer: !isCI,
  },
})
