import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, createMock, envHolder, rlHolder } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  createMock: vi.fn(),
  envHolder: { ANTHROPIC_API_KEY: 'sk-test' as string | undefined },
  rlHolder: { allowed: true },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@/env', () => ({ env: envHolder }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: createMock } } }))
vi.mock('@/lib/rate-limit', () => ({ checkActionRateLimit: vi.fn(async () => rlHolder.allowed) }))

import { aiParseProgramming } from '@/app/dashboard/programming/_actions/ai-parse-programming'

const staff = () => makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { role: 'coach' }, error: null } } })

beforeEach(() => {
  vi.clearAllMocks()
  envHolder.ANTHROPIC_API_KEY = 'sk-test'
  rlHolder.allowed = true
})

test('throttles a user over the AI rate limit (no AI call)', async () => {
  rlHolder.allowed = false
  serverCreate.mockResolvedValue(staff())
  const res = await aiParseProgramming('Mon Fran')
  expect(res.error).toMatch(/too often|slow down|wait/i)
  expect(createMock).not.toHaveBeenCalled()
})

test('rejects empty input before auth', async () => {
  const res = await aiParseProgramming('   ')
  expect(res.error).toMatch(/paste/i)
  expect(serverCreate).not.toHaveBeenCalled()
})

test('rejects input over the length cap', async () => {
  const res = await aiParseProgramming('x'.repeat(8001))
  expect(res.error).toMatch(/too long/i)
})

test('rejects a non-staff athlete (no AI call)', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { role: 'athlete' }, error: null } } }))
  const res = await aiParseProgramming('Mon Fran')
  expect(res.error).toMatch(/owners and coaches/i)
  expect(createMock).not.toHaveBeenCalled()
})

test('reports when the API key is not configured (no AI call)', async () => {
  envHolder.ANTHROPIC_API_KEY = undefined
  serverCreate.mockResolvedValue(staff())
  const res = await aiParseProgramming('Mon Fran')
  expect(res.error).toMatch(/configured/i)
  expect(createMock).not.toHaveBeenCalled()
})

test('returns the extracted block text on success', async () => {
  serverCreate.mockResolvedValue(staff())
  createMock.mockResolvedValue({ content: [{ type: 'text', text: '```\n2026-07-01 For Time\nFran\n21-15-9\n```' }] })
  const res = await aiParseProgramming('Mon Fran 21-15-9')
  expect(res.error).toBeNull()
  expect(res.text).toBe('2026-07-01 For Time\nFran\n21-15-9')
})

test('surfaces an SDK failure as a typed error, not a throw', async () => {
  serverCreate.mockResolvedValue(staff())
  createMock.mockRejectedValue(new Error('network'))
  const res = await aiParseProgramming('Mon Fran')
  expect(res.error).toMatch(/unavailable/i)
  expect(res.text).toBeNull()
})
