import { describe, it, expect } from 'vitest'
import { toSlug } from './slug'

describe('toSlug', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(toSlug('CrossFit Dubai')).toBe('crossfit-dubai')
  })

  it('strips non-alphanumerics and collapses runs of hyphens', () => {
    expect(toSlug("Ahmed's  Gym — #1!")).toBe('ahmeds-gym-1')
  })

  it('trims and caps at 40 chars', () => {
    expect(toSlug('  padded  ')).toBe('padded')
    expect(toSlug('x'.repeat(60))).toHaveLength(40)
  })

  it('returns empty string for symbol-only input', () => {
    expect(toSlug('***')).toBe('')
  })
})
