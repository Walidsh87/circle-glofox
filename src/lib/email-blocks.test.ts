import { test, expect } from 'vitest'
import { renderBlocks, validateBlocks, flattenBlocks, MAX_BLOCKS, type Block } from './email-blocks'

test('heading + paragraph render with first-name token replaced', () => {
  const html = renderBlocks([{ type: 'heading', text: 'Hi {{first_name}}' }, { type: 'paragraph', text: 'Welcome' }], { firstName: 'Sarah' })
  expect(html).toContain('Hi Sarah')
  expect(html).toContain('Welcome')
  expect(html).toContain('<h2')
})

test('text is HTML-escaped to prevent broken markup', () => {
  const html = renderBlocks([{ type: 'paragraph', text: 'a < b & c' }], { firstName: 'x' })
  expect(html).toContain('a &lt; b &amp; c')
})

test('image and button render their urls', () => {
  const html = renderBlocks([
    { type: 'image', url: 'https://x/img.jpg', alt: 'Promo' },
    { type: 'button', label: 'Book', url: 'https://x/book' },
  ], { firstName: 'x' })
  expect(html).toContain('src="https://x/img.jpg"')
  expect(html).toContain('alt="Promo"')
  expect(html).toContain('href="https://x/book"')
  expect(html).toContain('Book')
})

test('divider renders an hr', () => {
  expect(renderBlocks([{ type: 'divider' }], { firstName: 'x' })).toContain('<hr')
})

test('validateBlocks rejects empty list', () => {
  expect(validateBlocks([])).toMatch(/at least one/i)
})

test('validateBlocks rejects empty heading text', () => {
  expect(validateBlocks([{ type: 'heading', text: '   ' }])).toMatch(/empty/i)
})

test('validateBlocks rejects non-http image url', () => {
  expect(validateBlocks([{ type: 'image', url: 'ftp://x', alt: '' }])).toMatch(/image/i)
})

test('validateBlocks rejects button without label or bad url', () => {
  expect(validateBlocks([{ type: 'button', label: '', url: 'https://x' }])).toMatch(/label/i)
  expect(validateBlocks([{ type: 'button', label: 'Go', url: 'nope' }])).toMatch(/link/i)
})

test('validateBlocks rejects more than MAX_BLOCKS', () => {
  const many: Block[] = Array.from({ length: MAX_BLOCKS + 1 }, () => ({ type: 'divider' }))
  expect(validateBlocks(many)).toMatch(/at most/i)
})

test('validateBlocks accepts a valid set', () => {
  expect(validateBlocks([{ type: 'heading', text: 'Hi' }, { type: 'divider' }])).toBeNull()
})

test('flattenBlocks joins heading/paragraph/button text', () => {
  expect(flattenBlocks([{ type: 'heading', text: 'Hi' }, { type: 'paragraph', text: 'Body' }, { type: 'button', label: 'Go', url: 'https://x' }, { type: 'divider' }])).toBe('Hi\n\nBody\n\nGo')
})
