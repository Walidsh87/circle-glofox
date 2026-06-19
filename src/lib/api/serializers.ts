// Allow-list serializers — the structural PII guard. Every public-API response
// AND every webhook payload is built here, by EXPLICIT field pick (never spread,
// never `select('*')`). The 7 columns locked down by migration 071
// (id_number, blood_type, allergies, date_of_birth, emergency_contact_name/phone,
// id_type) are never read here, so they can never leak — regardless of scope.

// Permissive inputs: an index signature (unknown, not any) models the fact that
// a raw DB row may carry extra columns we must drop.
type Raw = Record<string, unknown>

export const MEMBER_COLUMNS = 'id, full_name, role, created_at'
export const MEMBER_PII_COLUMNS = 'id, full_name, role, created_at, email, phone'
export const CLASS_COLUMNS = 'id, starts_at, duration_minutes, capacity, status, template_id, coach_id'
export const BOOKING_COLUMNS = 'id, class_instance_id, athlete_id, booked_at, checked_in, credit_id'
export const MEMBERSHIP_COLUMNS = 'id, athlete_id, plan_name, monthly_price_aed, start_date, end_date, payment_status'
export const PACKAGE_COLUMNS = 'id, name, type, credit_count, price_aed, expiry_days, active'

export function serializeMember(row: Raw, includePii: boolean) {
  const base = {
    id: row.id as string,
    full_name: row.full_name as string | null,
    role: row.role as string,
    created_at: row.created_at as string,
  }
  return includePii
    ? { ...base, email: (row.email ?? null) as string | null, phone: (row.phone ?? null) as string | null }
    : base
}

export function serializeClass(row: Raw) {
  return {
    id: row.id as string,
    starts_at: row.starts_at as string,
    duration_minutes: row.duration_minutes as number,
    capacity: row.capacity as number,
    status: row.status as string,
    template_id: (row.template_id ?? null) as string | null,
    coach_id: (row.coach_id ?? null) as string | null,
  }
}

export function serializeBooking(row: Raw) {
  return {
    id: row.id as string,
    class_instance_id: row.class_instance_id as string,
    athlete_id: row.athlete_id as string,
    booked_at: row.booked_at as string,
    checked_in: row.checked_in as boolean,
    credit_id: (row.credit_id ?? null) as string | null,
  }
}

export function serializeMembership(row: Raw) {
  return {
    id: row.id as string,
    athlete_id: row.athlete_id as string,
    plan_name: row.plan_name as string,
    monthly_price_aed: (row.monthly_price_aed ?? null) as number | null,
    start_date: row.start_date as string,
    end_date: (row.end_date ?? null) as string | null,
    payment_status: row.payment_status as string,
  }
}

export function serializePackage(row: Raw) {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    credit_count: row.credit_count as number,
    price_aed: row.price_aed as number,
    expiry_days: (row.expiry_days ?? null) as number | null,
    active: row.active as boolean,
  }
}
