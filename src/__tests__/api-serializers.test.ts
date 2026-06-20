import { describe, test, expect } from 'vitest'
import { serializeMember, serializeClass, serializeBooking, serializeMembership, serializePackage } from '@/lib/api/serializers'

// The 7 columns migration 071 locked down — must NEVER appear in any API payload.
const LOCKDOWN = ['id_number', 'blood_type', 'allergies', 'date_of_birth', 'emergency_contact_name', 'emergency_contact_phone', 'id_type']

describe('serializeMember', () => {
  const raw = {
    id: 'm1', full_name: 'Sara', role: 'athlete', created_at: '2026-01-01', email: 'sara@x.com', phone: '+9715',
    // lockdown PII that might be present on the raw row — must be dropped:
    id_number: '784-1990-1', blood_type: 'O+', allergies: 'none', date_of_birth: '1990-01-01',
    emergency_contact_name: 'Mum', emergency_contact_phone: '+9714', id_type: 'emirates_id',
    notes: 'secret',
  }
  test('without members:pii → no email/phone, no lockdown fields', () => {
    const out = serializeMember(raw, false)
    expect(out).toEqual({ id: 'm1', full_name: 'Sara', role: 'athlete', created_at: '2026-01-01' })
    expect(out).not.toHaveProperty('email')
    for (const k of LOCKDOWN) expect(out).not.toHaveProperty(k)
  })
  test('with members:pii → email/phone included, but STILL no lockdown fields', () => {
    const out = serializeMember(raw, true)
    expect(out).toMatchObject({ id: 'm1', email: 'sara@x.com', phone: '+9715' })
    for (const k of LOCKDOWN) expect(out).not.toHaveProperty(k)
    expect(out).not.toHaveProperty('notes')
  })
})

describe('other serializers expose only allow-listed fields', () => {
  test('class', () => {
    expect(Object.keys(serializeClass({ id: 'c1', starts_at: 't', duration_minutes: 60, capacity: 12, status: 'scheduled', template_id: 'tp', coach_id: 'co', box_id: 'SECRET' })))
      .toEqual(['id', 'starts_at', 'duration_minutes', 'capacity', 'status', 'template_id', 'coach_id'])
  })
  test('booking', () => {
    expect(Object.keys(serializeBooking({ id: 'b1', class_instance_id: 'c', athlete_id: 'a', booked_at: 't', checked_in: false, credit_id: null, overridden_by: 'SECRET' })))
      .toEqual(['id', 'class_instance_id', 'athlete_id', 'booked_at', 'checked_in', 'credit_id'])
  })
  test('membership omits notes', () => {
    const out = serializeMembership({ id: 'mm', athlete_id: 'a', plan_name: 'Unlimited', monthly_price_aed: 500, start_date: 'd', end_date: null, payment_status: 'paid', notes: 'SECRET' })
    expect(out).not.toHaveProperty('notes')
    expect(out.plan_name).toBe('Unlimited')
  })
  test('package', () => {
    expect(Object.keys(serializePackage({ id: 'p', name: 'Pack', type: 'class_pack', credit_count: 10, price_aed: 250, expiry_days: 90, active: true, box_id: 'SECRET' })))
      .toEqual(['id', 'name', 'type', 'credit_count', 'price_aed', 'expiry_days', 'active'])
  })
})
