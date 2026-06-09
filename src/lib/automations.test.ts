import { test, expect } from 'vitest'
import { matchAutomation, TRIGGER_TYPES, type AutoMember } from './automations'

const TODAY = '2026-06-09'

function member(over: Partial<AutoMember> = {}): AutoMember {
  return {
    athlete_id: 'a1',
    email: 'a@x.com',
    full_name: 'Sarah Lee',
    marketing_opt_out: false,
    created_at: '2026-01-01',
    date_of_birth: null,
    membershipStatus: 'paid',
    trialEndDate: null,
    lastCheckIn: null,
    ...over,
  }
}

test('TRIGGER_TYPES lists the four v1 triggers', () => {
  expect([...TRIGGER_TYPES]).toEqual(['no_checkin', 'trial_ending', 'joined', 'birthday'])
})

test('opted-out and no-email members never match', () => {
  const optedOut = member({ athlete_id: 'o', marketing_opt_out: true, date_of_birth: '1990-06-09' })
  const noEmail = member({ athlete_id: 'n', email: null, date_of_birth: '1990-06-09' })
  expect(matchAutomation({ id: 'r', trigger_type: 'birthday', trigger_days: null }, [optedOut, noEmail], TODAY)).toEqual([])
})

test('joined fires on exactly day N with a fixed fire_key', () => {
  const m = member({ created_at: '2026-06-02' }) // 7 days before today
  const res = matchAutomation({ id: 'r', trigger_type: 'joined', trigger_days: 7 }, [m], TODAY)
  expect(res).toEqual([{ athlete_id: 'a1', fire_key: 'joined' }])
})

test('joined does not fire on day N-1 or N+1', () => {
  const early = member({ athlete_id: 'e', created_at: '2026-06-03' }) // 6 days
  const late = member({ athlete_id: 'l', created_at: '2026-06-01' })  // 8 days
  expect(matchAutomation({ id: 'r', trigger_type: 'joined', trigger_days: 7 }, [early, late], TODAY)).toEqual([])
})

test('trial_ending fires N days before the trial end_date, keyed by end_date', () => {
  const m = member({ trialEndDate: '2026-06-11' }) // 2 days out
  const res = matchAutomation({ id: 'r', trigger_type: 'trial_ending', trigger_days: 2 }, [m], TODAY)
  expect(res).toEqual([{ athlete_id: 'a1', fire_key: '2026-06-11' }])
})

test('trial_ending ignores members with no active trial', () => {
  const m = member({ trialEndDate: null })
  expect(matchAutomation({ id: 'r', trigger_type: 'trial_ending', trigger_days: 2 }, [m], TODAY)).toEqual([])
})

test('birthday matches month+day and keys by year', () => {
  const m = member({ date_of_birth: '1992-06-09' })
  const res = matchAutomation({ id: 'r', trigger_type: 'birthday', trigger_days: null }, [m], TODAY)
  expect(res).toEqual([{ athlete_id: 'a1', fire_key: '2026' }])
})

test('birthday skips a different day and null dob', () => {
  const wrong = member({ athlete_id: 'w', date_of_birth: '1992-06-10' })
  const none = member({ athlete_id: 'n', date_of_birth: null })
  expect(matchAutomation({ id: 'r', trigger_type: 'birthday', trigger_days: null }, [wrong, none], TODAY)).toEqual([])
})

test('no_checkin fires at exactly N days since last check-in, keyed by that date', () => {
  const m = member({ lastCheckIn: '2026-05-26' }) // 14 days ago
  const res = matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [m], TODAY)
  expect(res).toEqual([{ athlete_id: 'a1', fire_key: '2026-05-26' }])
})

test('no_checkin uses created_at (none: key) when the member never checked in', () => {
  const m = member({ lastCheckIn: null, created_at: '2026-05-26' })
  const res = matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [m], TODAY)
  expect(res).toEqual([{ athlete_id: 'a1', fire_key: 'none:2026-05-26' }])
})

test('no_checkin re-arms: a newer last check-in yields a different fire_key', () => {
  const lapsed = member({ lastCheckIn: '2026-05-26' })
  const a = matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [lapsed], TODAY)[0]
  const returned = member({ lastCheckIn: '2026-05-26' }) // same episode → same key
  const b = matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [returned], TODAY)[0]
  expect(a.fire_key).toBe(b.fire_key)
  const newEpisode = member({ lastCheckIn: '2026-05-27' })
  const c = matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [newEpisode], '2026-06-10')[0]
  expect(c.fire_key).toBe('2026-05-27')
})

test('no_checkin only targets active (paid) members', () => {
  for (const status of ['frozen', 'unpaid', 'no_membership'] as const) {
    const m = member({ membershipStatus: status, lastCheckIn: '2026-05-26' })
    expect(matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [m], TODAY)).toEqual([])
  }
})

test('no_checkin does not fire before the threshold', () => {
  const m = member({ lastCheckIn: '2026-06-02' }) // 7 days ago, N=14
  expect(matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [m], TODAY)).toEqual([])
})
