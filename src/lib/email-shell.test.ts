import { describe, it, expect } from 'vitest'
import { emailShell, emailButton } from './email-shell'

describe('emailShell', () => {
  it('wraps content in a full ivory-on-white document', () => {
    const html = emailShell('<p>Hello</p>')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('#F6F4ED') // ivory page background
    expect(html).toContain('#FFFFFF') // white card
    expect(html).toContain('<p>Hello</p>')
  })
  it('renders RTL for Arabic', () => {
    const html = emailShell('<p>مرحبا</p>', 'ar')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('text-align:right')
  })
  it('defaults to LTR', () => {
    expect(emailShell('<p>Hi</p>')).toContain('dir="ltr"')
  })
})

describe('emailButton', () => {
  it('renders a lime table-based CTA with dark text', () => {
    const html = emailButton('Update your card', 'https://x/portal/tok')
    expect(html).toContain('background:#C8F135')
    expect(html).toContain('color:#15150F')
    expect(html).toContain('href="https://x/portal/tok"')
    expect(html).toContain('Update your card')
  })
})
