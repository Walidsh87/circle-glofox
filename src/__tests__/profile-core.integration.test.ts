import { test, expect } from 'vitest'
import { makeSupabaseMock, type MockResult } from './helpers/supabase-mock'
import { getOwnProfileViaApi, updateOwnProfileViaApi } from '@/lib/api/profile-core'

function svc(results: Record<string, MockResult | MockResult[]>) {
  return makeSupabaseMock({ results })
}
const base = { phone: null, emergencyContactName: null, emergencyContactPhone: null, bloodType: null, allergies: null }

test('getOwnProfileViaApi returns the member PII for their own row', async () => {
  const m = svc({ profiles: { data: { phone: '0501234567', emergency_contact_name: 'Mom', emergency_contact_phone: '0555', blood_type: 'O+', allergies: 'Nuts' }, error: null } })
  const res = await getOwnProfileViaApi(m as never, 'a1', 'b1')
  expect(res).toEqual({ phone: '0501234567', emergency_contact_name: 'Mom', emergency_contact_phone: '0555', blood_type: 'O+', allergies: 'Nuts' })
})

test('getOwnProfileViaApi returns null when no row', async () => {
  const m = svc({ profiles: { data: null, error: null } })
  expect(await getOwnProfileViaApi(m as never, 'a1', 'b1')).toBeNull()
})

test('valid update → ok, writes the 5 columns (whitespace trimmed, empties nulled)', async () => {
  const m = svc({ profiles: { data: null, error: null } })
  const res = await updateOwnProfileViaApi(m as never, 'a1', 'b1', {
    phone: '  0501234567 ', emergencyContactName: ' Mom ', emergencyContactPhone: '  ', bloodType: 'O+', allergies: 'Peanuts',
  })
  expect(res).toEqual({ ok: true })
  expect(m.builder('profiles')!.update).toHaveBeenCalledWith({
    phone: '0501234567',
    emergency_contact_name: 'Mom',
    emergency_contact_phone: null, // whitespace-only → null
    blood_type: 'O+',
    allergies: 'Peanuts',
  })
})

test('invalid UAE phone → validation_error, no write', async () => {
  const m = svc({ profiles: { data: null, error: null } })
  const res = await updateOwnProfileViaApi(m as never, 'a1', 'b1', { ...base, phone: '12345' })
  expect(res).toEqual({ ok: false, code: 'validation_error', message: expect.stringMatching(/UAE phone/i) })
  expect(m.builder('profiles')).toBeUndefined() // never reached the DB
})

test('invalid blood type → validation_error, no write', async () => {
  const m = svc({ profiles: { data: null, error: null } })
  const res = await updateOwnProfileViaApi(m as never, 'a1', 'b1', { ...base, bloodType: 'Z+' })
  expect(res).toEqual({ ok: false, code: 'validation_error', message: expect.stringMatching(/blood type/i) })
  expect(m.builder('profiles')).toBeUndefined()
})

test('all-null update (clearing everything) is valid → ok', async () => {
  const m = svc({ profiles: { data: null, error: null } })
  expect(await updateOwnProfileViaApi(m as never, 'a1', 'b1', base)).toEqual({ ok: true })
})

test('a DB error on update → internal (not thrown)', async () => {
  const m = svc({ profiles: { data: null, error: { message: 'boom' } } })
  const res = await updateOwnProfileViaApi(m as never, 'a1', 'b1', { ...base, bloodType: 'A-' })
  expect(res).toEqual({ ok: false, code: 'internal', message: expect.any(String) })
})
