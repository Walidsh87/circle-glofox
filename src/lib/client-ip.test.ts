import { test, expect } from 'vitest'
import { resolveClientIp } from './client-ip'

const h = (init: Record<string, string>) => new Headers(init)

test('prefers x-real-ip (Vercel-set, single trusted value)', () => {
  expect(resolveClientIp(h({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
})

test('x-real-ip wins over a spoofed x-forwarded-for left token', () => {
  expect(
    resolveClientIp(h({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9', 'x-real-ip': '203.0.113.9' }))
  ).toBe('203.0.113.9')
})

test('falls back to x-forwarded-for when no x-real-ip', () => {
  expect(resolveClientIp(h({ 'x-forwarded-for': '198.51.100.7' }))).toBe('198.51.100.7')
})

test('falls back to loopback when nothing is present', () => {
  expect(resolveClientIp(h({}))).toBe('127.0.0.1')
})
