import { describe, it, expect } from 'vitest'
import { escapeHtml, escapeHtmlNoQuote } from './html-escape'

describe('escapeHtml', () => {
  it('escapes the four HTML special chars including quotes', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;',
    )
  })
  it('escapes & first so emitted entities are not double-escaped', () => {
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
  it('returns plain text unchanged', () => {
    expect(escapeHtml('Circle Fitness')).toBe('Circle Fitness')
  })
})

describe('escapeHtmlNoQuote', () => {
  it('escapes & < > but leaves quotes intact', () => {
    expect(escapeHtmlNoQuote(`Tom & "Jerry" <b>`)).toBe('Tom &amp; "Jerry" &lt;b&gt;')
  })
  it('matches a single-pass [<>&] escape for content (order-independent)', () => {
    expect(escapeHtmlNoQuote('a<b>c&d')).toBe('a&lt;b&gt;c&amp;d')
  })
  it('escapes & first (no double-escape)', () => {
    expect(escapeHtmlNoQuote('&lt;')).toBe('&amp;lt;')
  })
})
