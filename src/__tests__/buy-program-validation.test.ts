import { describe, it, expect } from 'vitest'
import { validateBuyProgramInput } from '@/app/dashboard/shop/_lib/validation'

describe('validateBuyProgramInput', () => {
  it('rejects an empty id', () => {
    expect(validateBuyProgramInput('')).not.toBeNull()
  })
  it('rejects a non-uuid id', () => {
    expect(validateBuyProgramInput('not-a-uuid')).not.toBeNull()
  })
  it('accepts a uuid', () => {
    expect(validateBuyProgramInput('11111111-1111-4111-8111-111111111111')).toBeNull()
  })
})
