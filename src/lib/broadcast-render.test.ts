import { test, expect } from 'vitest'
import { firstNameOf, renderBroadcastBody } from './broadcast-render'

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
