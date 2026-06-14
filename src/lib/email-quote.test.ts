import { describe, it, expect } from 'vitest'
import { buildQuoteEmail } from './email'

describe('buildQuoteEmail', () => {
  const input = {
    to: 'sara@x.com', buyerName: 'Sara', gymName: 'Functional Fitness',
    quoteTitle: 'Ramadan PT Bundle', quoteNumber: 'QUO-FUNCTIONALFI-2026-0042',
    totalAed: 420, quoteUrl: 'https://app.example.com/quote/tok-123',
  }
  it('puts the quote number in the subject', () => {
    expect(buildQuoteEmail(input).subject).toContain('QUO-FUNCTIONALFI-2026-0042')
  })
  it('renders buyer, total and a CTA pointing at the quote URL', () => {
    const { html } = buildQuoteEmail(input)
    expect(html).toContain('Sara')
    expect(html).toContain('420.00')
    expect(html).toContain('href="https://app.example.com/quote/tok-123"')
    expect(html).toContain('<!DOCTYPE html>') // wrapped by emailShell
  })
  it('escapes HTML in user-supplied fields', () => {
    const { html } = buildQuoteEmail({ ...input, buyerName: '<script>x</script>' })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
