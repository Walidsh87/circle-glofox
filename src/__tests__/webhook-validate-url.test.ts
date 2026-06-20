import { describe, test, expect } from 'vitest'
import { isSafeWebhookUrl } from '@/lib/webhooks/validate-url'

describe('isSafeWebhookUrl — accepts', () => {
  test('a normal https URL', () => {
    expect(isSafeWebhookUrl('https://hooks.example.com/x')).toEqual({ ok: true })
  })
  test('a normal https URL with an explicit :443 port', () => {
    expect(isSafeWebhookUrl('https://hooks.example.com:443/x')).toEqual({ ok: true })
  })
  test('a public literal IPv4 over https', () => {
    expect(isSafeWebhookUrl('https://8.8.8.8/hook')).toEqual({ ok: true })
  })
})

describe('isSafeWebhookUrl — rejects scheme/parse', () => {
  test('http (not https)', () => {
    expect(isSafeWebhookUrl('http://hooks.example.com/x').ok).toBe(false)
  })
  test('a non-http(s) scheme', () => {
    expect(isSafeWebhookUrl('ftp://hooks.example.com/x').ok).toBe(false)
  })
  test('a garbage string', () => {
    expect(isSafeWebhookUrl('not a url').ok).toBe(false)
  })
  test('an empty string', () => {
    expect(isSafeWebhookUrl('').ok).toBe(false)
  })
})

describe('isSafeWebhookUrl — rejects hostnames', () => {
  test('localhost', () => {
    expect(isSafeWebhookUrl('https://localhost/x').ok).toBe(false)
  })
  test('a .internal host', () => {
    expect(isSafeWebhookUrl('https://x.internal/x').ok).toBe(false)
  })
  test('a .local host', () => {
    expect(isSafeWebhookUrl('https://printer.local/x').ok).toBe(false)
  })
})

describe('isSafeWebhookUrl — rejects private/loopback/link-local IPv4', () => {
  test('127.0.0.1 (loopback)', () => {
    expect(isSafeWebhookUrl('https://127.0.0.1/x').ok).toBe(false)
  })
  test('a 127.x.x.x address', () => {
    expect(isSafeWebhookUrl('https://127.5.5.5/x').ok).toBe(false)
  })
  test('10.x (private)', () => {
    expect(isSafeWebhookUrl('https://10.0.0.5/x').ok).toBe(false)
  })
  test('172.16.x (private)', () => {
    expect(isSafeWebhookUrl('https://172.16.0.1/x').ok).toBe(false)
  })
  test('172.31.x (private upper bound)', () => {
    expect(isSafeWebhookUrl('https://172.31.255.255/x').ok).toBe(false)
  })
  test('192.168.x (private)', () => {
    expect(isSafeWebhookUrl('https://192.168.1.1/x').ok).toBe(false)
  })
  test('169.254.x (link-local)', () => {
    expect(isSafeWebhookUrl('https://169.254.1.1/x').ok).toBe(false)
  })
  test('169.254.169.254 (cloud metadata)', () => {
    expect(isSafeWebhookUrl('https://169.254.169.254/latest/meta-data').ok).toBe(false)
  })
  test('0.0.0.0', () => {
    expect(isSafeWebhookUrl('https://0.0.0.0/x').ok).toBe(false)
  })
  test('172.15.x is NOT private (allowed)', () => {
    expect(isSafeWebhookUrl('https://172.15.0.1/x')).toEqual({ ok: true })
  })
  test('172.32.x is NOT private (allowed)', () => {
    expect(isSafeWebhookUrl('https://172.32.0.1/x')).toEqual({ ok: true })
  })
})

describe('isSafeWebhookUrl — rejects private/loopback/link-local IPv6', () => {
  test('::1 (loopback)', () => {
    expect(isSafeWebhookUrl('https://[::1]/x').ok).toBe(false)
  })
  test('fc00::/7 unique-local (fc..)', () => {
    expect(isSafeWebhookUrl('https://[fc00::1]/x').ok).toBe(false)
  })
  test('fc00::/7 unique-local (fd..)', () => {
    expect(isSafeWebhookUrl('https://[fd12:3456::1]/x').ok).toBe(false)
  })
  test('fe80::/10 link-local', () => {
    expect(isSafeWebhookUrl('https://[fe80::1]/x').ok).toBe(false)
  })
})

describe('isSafeWebhookUrl — rejects non-default ports', () => {
  test('a non-443 port', () => {
    expect(isSafeWebhookUrl('https://hooks.example.com:8443/x').ok).toBe(false)
  })
  test('port 80', () => {
    expect(isSafeWebhookUrl('https://hooks.example.com:80/x').ok).toBe(false)
  })
})

describe('isSafeWebhookUrl — rejects IPv4-mapped IPv6 (SSRF bypass)', () => {
  test('::ffff:169.254.169.254 (cloud metadata via mapped IPv6)', () => {
    expect(isSafeWebhookUrl('https://[::ffff:169.254.169.254]/latest/meta-data').ok).toBe(false)
  })
  test('::ffff:127.0.0.1 (loopback via mapped IPv6)', () => {
    expect(isSafeWebhookUrl('https://[::ffff:127.0.0.1]/x').ok).toBe(false)
  })
  test('::ffff:10.0.0.1 (private via mapped IPv6)', () => {
    expect(isSafeWebhookUrl('https://[::ffff:10.0.0.1]/x').ok).toBe(false)
  })
  test('bare :: (unspecified) and ::0', () => {
    expect(isSafeWebhookUrl('https://[::]/x').ok).toBe(false)
    expect(isSafeWebhookUrl('https://[::0]/x').ok).toBe(false)
  })
})
