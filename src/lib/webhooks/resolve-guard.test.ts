import { test, expect } from 'vitest'
import { isResolvedHostSafe } from './resolve-guard'

const fakeLookup = (addrs: Array<{ address: string; family: number }>) => async () => addrs

test('rejects a hostname that resolves to the cloud metadata IP (DNS rebind)', async () => {
  const res = await isResolvedHostSafe('rebind.example.com', fakeLookup([{ address: '169.254.169.254', family: 4 }]))
  expect(res.ok).toBe(false)
})

test('rejects resolution to a private IPv4', async () => {
  const res = await isResolvedHostSafe('x.example.com', fakeLookup([{ address: '10.0.0.5', family: 4 }]))
  expect(res.ok).toBe(false)
})

test('rejects resolution to IPv6 loopback', async () => {
  const res = await isResolvedHostSafe('x.example.com', fakeLookup([{ address: '::1', family: 6 }]))
  expect(res.ok).toBe(false)
})

test('rejects if ANY resolved address is private (mixed records)', async () => {
  const res = await isResolvedHostSafe('x.example.com', fakeLookup([
    { address: '93.184.216.34', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]))
  expect(res.ok).toBe(false)
})

test('allows a public address', async () => {
  const res = await isResolvedHostSafe('example.com', fakeLookup([{ address: '93.184.216.34', family: 4 }]))
  expect(res.ok).toBe(true)
})

test('rejects when resolution fails or returns nothing', async () => {
  expect((await isResolvedHostSafe('x', async () => { throw new Error('ENOTFOUND') })).ok).toBe(false)
  expect((await isResolvedHostSafe('x', fakeLookup([]))).ok).toBe(false)
})
