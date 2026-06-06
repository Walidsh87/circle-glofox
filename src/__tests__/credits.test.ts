import { selectBestBatch, decideEntitlement, type CreditBatch } from '@/lib/credits'

const today = '2026-06-06'

describe('selectBestBatch', () => {
  test('returns null when there are no batches', () => {
    expect(selectBestBatch([], today)).toBeNull()
  })

  test('skips batches with zero remaining', () => {
    const batches: CreditBatch[] = [{ id: 'a', credits_remaining: 0, expires_at: null }]
    expect(selectBestBatch(batches, today)).toBeNull()
  })

  test('skips expired batches (expires_at before today)', () => {
    const batches: CreditBatch[] = [{ id: 'a', credits_remaining: 5, expires_at: '2026-06-05' }]
    expect(selectBestBatch(batches, today)).toBeNull()
  })

  test('keeps a batch expiring exactly today', () => {
    const batches: CreditBatch[] = [{ id: 'a', credits_remaining: 5, expires_at: today }]
    expect(selectBestBatch(batches, today)?.id).toBe('a')
  })

  test('picks the soonest-expiring usable batch', () => {
    const batches: CreditBatch[] = [
      { id: 'later', credits_remaining: 5, expires_at: '2026-12-31' },
      { id: 'sooner', credits_remaining: 5, expires_at: '2026-07-01' },
    ]
    expect(selectBestBatch(batches, today)?.id).toBe('sooner')
  })

  test('prefers a dated batch over a never-expiring one (use perishable credits first)', () => {
    const batches: CreditBatch[] = [
      { id: 'forever', credits_remaining: 5, expires_at: null },
      { id: 'dated', credits_remaining: 5, expires_at: '2026-08-01' },
    ]
    expect(selectBestBatch(batches, today)?.id).toBe('dated')
  })

  test('falls back to a never-expiring batch when no dated one is usable', () => {
    const batches: CreditBatch[] = [
      { id: 'forever', credits_remaining: 5, expires_at: null },
      { id: 'expired', credits_remaining: 5, expires_at: '2020-01-01' },
    ]
    expect(selectBestBatch(batches, today)?.id).toBe('forever')
  })

  test('returns a usable batch when all are never-expiring (two null-expiry batches)', () => {
    const batches: CreditBatch[] = [
      { id: 'a', credits_remaining: 5, expires_at: null },
      { id: 'b', credits_remaining: 3, expires_at: null },
    ]
    expect(selectBestBatch(batches, today)).not.toBeNull()
  })
})

describe('decideEntitlement', () => {
  const batch: CreditBatch = { id: 'a', credits_remaining: 5, expires_at: null }

  test('paid membership wins even when a credit exists', () => {
    expect(decideEntitlement(true, batch)).toEqual({ kind: 'membership' })
  })

  test('no membership + a usable credit → consume the credit', () => {
    expect(decideEntitlement(false, batch)).toEqual({ kind: 'credit', batch })
  })

  test('no membership + no credit → none', () => {
    expect(decideEntitlement(false, null)).toEqual({ kind: 'none' })
  })
})
