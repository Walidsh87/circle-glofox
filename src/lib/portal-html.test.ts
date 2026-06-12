import { describe, it, expect } from 'vitest'
import { portalErrorHtml } from './portal-html'

describe('portalErrorHtml', () => {
  it('renders a complete branded document with title and message', () => {
    const html = portalErrorHtml('Link expired', 'This payment update link has expired.')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Link expired')
    expect(html).toContain('This payment update link has expired.')
    expect(html).toContain('#F6F4ED')
  })

  it('escapes HTML in interpolated text', () => {
    const html = portalErrorHtml('<script>', 'a < b')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &lt; b')
  })
})
