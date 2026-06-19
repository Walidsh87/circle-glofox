import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, sendSmsMock, configuredMock, rlHolder } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  sendSmsMock: vi.fn<(i: { to: string; body: string; statusCallback?: string }) => Promise<{ sid: string | null; status: string | null; error: string | null }>>(
    () => Promise.resolve({ sid: 'SM1', status: 'queued', error: null })
  ),
  configuredMock: vi.fn(() => true),
  rlHolder: { allowed: true },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/twilio', () => ({ sendSms: sendSmsMock, smsConfigured: configuredMock }))
vi.mock('@/lib/rate-limit', () => ({ checkActionRateLimit: vi.fn(async () => rlHolder.allowed) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendSmsCampaign } from '@/app/dashboard/sms/_actions/send-sms-campaign'

beforeEach(() => { vi.clearAllMocks(); configuredMock.mockReturnValue(true); rlHolder.allowed = true })

test('throttles an owner over the SMS rate limit (no send)', async () => {
  rlHolder.allowed = false
  serverCreate.mockResolvedValue(ownerRls())
  const res = await sendSmsCampaign('Hi team', 'all', null)
  expect(res.error).toMatch(/too often|slow down|wait/i)
  expect(sendSmsMock).not.toHaveBeenCalled()
})

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}
function service(profilesData: unknown[]) {
  return makeSupabaseMock({
    results: {
      profiles: { data: profilesData, error: null },
      memberships: { data: [], error: null },
      member_tags: { data: [], error: null },
      sms_campaigns: { data: { id: 'c1' }, error: null },
    },
  })
}

test('non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await sendSmsCampaign('Hi', 'all', null)
  expect(res.error).toMatch(/owner/i)
  expect(sendSmsMock).not.toHaveBeenCalled()
})

test('returns a typed error when SMS is not configured', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  configuredMock.mockReturnValue(false)
  const res = await sendSmsCampaign('Hi team', 'all', null)
  expect(res.error).toMatch(/not configured/i)
  expect(sendSmsMock).not.toHaveBeenCalled()
})

test('happy path creates a campaign, sends, stores the twilio sid', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([{ id: 'a1', full_name: 'Sarah Lee', email: null, phone: '0501234567', marketing_opt_out: false }])
  serviceCreate.mockReturnValue(svc)

  const res = await sendSmsCampaign('Hi {{first_name}}', 'all', null)

  expect(res.error).toBeNull()
  expect(res.sent).toBe(1)
  expect(sendSmsMock).toHaveBeenCalledTimes(1)
  expect(sendSmsMock.mock.calls[0][0]).toEqual(expect.objectContaining({ to: '+971501234567', body: 'Hi Sarah' }))
  const updateCalls = svc.builder('sms_recipients').update.mock.calls.map((c: unknown[]) => c[0])
  expect(updateCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'sent', twilio_sid: 'SM1' })]))
})

test('opted-out and no-phone members are skipped, not sent', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([
    { id: 'o', full_name: 'Opt Out', email: null, phone: '0501112222', marketing_opt_out: true },
    { id: 'n', full_name: 'No Phone', email: null, phone: null, marketing_opt_out: false },
  ])
  serviceCreate.mockReturnValue(svc)
  const res = await sendSmsCampaign('Hi', 'all', null)
  expect(res.sent).toBe(0)
  expect(res.skipped).toBe(2)
  expect(sendSmsMock).not.toHaveBeenCalled()
})
