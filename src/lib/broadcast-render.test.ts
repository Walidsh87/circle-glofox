import { test, expect } from 'vitest'
import { firstNameOf, renderBroadcastBody, renderEmail } from './broadcast-render'

test('firstNameOf returns the first word', () => {
  expect(firstNameOf('Sarah Lee')).toBe('Sarah')
})

test('firstNameOf falls back to "there" for empty/blank names', () => {
  expect(firstNameOf('')).toBe('there')
  expect(firstNameOf('   ')).toBe('there')
})

test('renderBroadcastBody replaces all {{first_name}} tokens', () => {
  const html = renderBroadcastBody('Hi {{first_name}}, welcome {{first_name}}!', {
    firstName: 'Sarah', gymName: 'CrossFit X', unsubscribeUrl: 'https://app/u/tok',
  })
  expect(html).toContain('Hi Sarah, welcome Sarah!')
})

test('renderBroadcastBody appends gym name + unsubscribe link', () => {
  const html = renderBroadcastBody('Hello', {
    firstName: 'Sarah', gymName: 'CrossFit X', unsubscribeUrl: 'https://app/u/tok',
  })
  expect(html).toContain('CrossFit X')
  expect(html).toContain('href="https://app/u/tok"')
  expect(html.toLowerCase()).toContain('unsubscribe')
})

test('renderEmail with blocks renders block HTML + footer', () => {
  const html = renderEmail({
    blocks: [{ type: 'heading', text: 'Hi {{first_name}}' }],
    plainBody: 'ignored',
    ctx: { firstName: 'Sarah', gymName: 'CrossFit X', unsubscribeUrl: 'https://app/u/tok' },
  })
  expect(html).toContain('Hi Sarah')
  expect(html).toContain('<h2')
  expect(html).toContain('href="https://app/u/tok"')
  expect(html).toContain('CrossFit X')
})

test('renderEmail wraps output in the light email shell', () => {
  const html = renderEmail({
    blocks: [{ type: 'paragraph', text: 'Hi {{first_name}}' }],
    plainBody: '',
    ctx: { firstName: 'Sarah', gymName: 'Iron Temple', unsubscribeUrl: 'https://app/u/tok' },
  })
  expect(html).toContain('<!DOCTYPE html>')
  expect(html).toContain('#F6F4ED')
})

test('renderEmail with null blocks falls back to plain body + footer', () => {
  const html = renderEmail({
    blocks: null,
    plainBody: 'Hello {{first_name}}',
    ctx: { firstName: 'Sarah', gymName: 'CrossFit X', unsubscribeUrl: 'https://app/u/tok' },
  })
  expect(html).toContain('Hello Sarah')
  expect(html.toLowerCase()).toContain('unsubscribe')
})
