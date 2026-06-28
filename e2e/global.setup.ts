import { test as setup } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { seed, magicTokenFor, USERS, authFile, type RoleKey } from './setup/fixtures'

// Runs once before the suite (a Playwright "setup" project). Seeds the e2e gym,
// then logs each role in via admin generateLink → the real /auth/confirm route,
// and saves a reusable storageState per role.
setup('seed data + authenticate all roles', async ({ browser }) => {
  setup.setTimeout(120_000)
  mkdirSync('e2e/.auth', { recursive: true })

  await seed()

  for (const key of Object.keys(USERS) as RoleKey[]) {
    const tokenHash = await magicTokenFor(USERS[key].email)
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=/dashboard`)
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 })
    await ctx.storageState({ path: authFile(key) })
    await ctx.close()
  }
})
