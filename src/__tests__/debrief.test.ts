import { describe, it, expect } from 'vitest'
import { validateDebrief } from '@/lib/debrief'

describe('validateDebrief', () => {
  it('accepts a normal recap', () => expect(validateDebrief('Great session, big lifts from Sara.')).toBeNull())
  it('rejects empty', () => expect(validateDebrief('')).not.toBeNull())
  it('rejects whitespace-only', () => expect(validateDebrief('   ')).not.toBeNull())
  it('rejects over 2000 chars', () => expect(validateDebrief('x'.repeat(2001))).not.toBeNull())
  it('accepts exactly 2000 chars', () => expect(validateDebrief('x'.repeat(2000))).toBeNull())
})
