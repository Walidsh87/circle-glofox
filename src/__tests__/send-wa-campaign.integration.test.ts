import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, sendWaMock, waConfiguredMock } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  sendWaMock: vi.fn<(i: { to: string; contentSid: string; contentVariables: Record<string, string>; statusCallback?: string }) => Promise<{ sid: string | null; status: string | null; error: string | null }>>(
    () => Promise.resolve({ sid: 'WA1', status: 'queued', error: null })
  ),
  waConfiguredMock: vi.fn(() => true),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/twilio', () => ({ sendWhatsApp: sendWaMock, waConfigured: waConfiguredMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendWaCampaign } from '@/app/dashboard/whatsapp/_actions/send-wa-campaign'

beforeEach(() => { vi.clearAllMocks(); waConfiguredMock.mockReturnValue(true) })

const SID = 'HX' + 'a'.repeat(32)
const template = { id: 't1', content_sid: SID, body_preview: 'Hi {{1}}', var_count: 1 }

function ownerRls() {
  return makeSupabaseMock({
    user: { id: 'owner1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'owner' }, error: null },
      wa_templates: { data: template, error: null },
    },
  })
}
function service(profilesData: unknown[]) {
  return makeSupabaseMock({
    results: {
      profiles: { data: profilesData, error: null },
      memberships: { data: [], error: null },
      member_tags: { data: [], error: null },
      wa_campaigns: { data: { id: 'c1' }, error: null },
    },
  })
}

test('non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await sendWaCampaign('t1', { '1': 'x' }, 'all', null)
  expect(res.error).toMatch(/owner/i)
  expect(sendWaMock).not.toHaveBeenCalled()
})

test('returns a typed error when WhatsApp is not configured', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  waConfiguredMock.mockReturnValue(false)
  const res = await sendWaCampaign('t1', { '1': 'x' }, 'all', null)
  expect(res.error).toMatch(/not configured/i)
  expect(sendWaMock).not.toHaveBeenCalled()
})

test('rejects an unfilled template slot', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await sendWaCampaign('t1', {}, 'all', null)
  expect(res.error).toMatch(/\{\{1\}\}/)
  expect(sendWaMock).not.toHaveBeenCalled()
})

test('happy path creates campaign, sends rendered vars, stores the twilio sid', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([{ id: 'a1', full_name: 'Sarah Lee', email: null, phone: '0501234567', marketing_opt_out: false }])
  serviceCreate.mockReturnValue(svc)

  const res = await sendWaCampaign('t1', { '1': '{{first_name}}' }, 'all', null)

  expect(res.error).toBeNull()
  expect(res.sent).toBe(1)
  expect(sendWaMock).toHaveBeenCalledTimes(1)
  expect(sendWaMock.mock.calls[0][0]).toEqual(expect.objectContaining({
    to: '+971501234567',
    contentSid: SID,
    contentVariables: { '1': 'Sarah' },
  }))
  const campIns = svc.builder('wa_campaigns').insert.mock.calls[0][0]
  expect(campIns).toEqual(expect.objectContaining({ template_id: 't1', body_preview: 'Hi {{1}}' }))
  const updateCalls = svc.builder('wa_recipients').update.mock.calls.map((c: unknown[]) => c[0])
  expect(updateCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'sent', twilio_sid: 'WA1' })]))
})

test('opted-out and no-phone members are skipped, not sent', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([
    { id: 'o', full_name: 'Opt Out', email: null, phone: '0501112222', marketing_opt_out: true },
    { id: 'n', full_name: 'No Phone', email: null, phone: null, marketing_opt_out: false },
  ])
  serviceCreate.mockReturnValue(svc)
  const res = await sendWaCampaign('t1', { '1': 'x' }, 'all', null)
  expect(res.sent).toBe(0)
  expect(res.skipped).toBe(2)
  expect(sendWaMock).not.toHaveBeenCalled()
})
