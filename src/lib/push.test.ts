import { describe, it, expect } from 'vitest'
import { buildDigestPushes } from './push'

const rows = [{ athlete_id: 'a', box_id: 'box1', starts_at: '2026-06-13T06:00:00Z', class_name: 'CrossFit' }]

describe('buildDigestPushes', () => {
  it('English by default', () => {
    const [p] = buildDigestPushes(rows, 'Asia/Dubai')
    expect(p.payload.title).toBe('Today at the gym')
    expect(p.payload.body).toContain('CrossFit at')
  })
  it('Arabic when locale map says ar', () => {
    const [p] = buildDigestPushes(rows, 'Asia/Dubai', new Map([['a', 'ar']]))
    expect(p.payload.title).toBe('اليوم في النادي')
    expect(p.payload.body).toContain('CrossFit في')
  })
})
