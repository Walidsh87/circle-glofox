// DNS-rebind defence for outbound webhook delivery. isSafeWebhookUrl() only checks
// the hostname STRING; a tenant URL with an innocuous hostname can still resolve to a
// private/metadata IP at fetch time. This re-validates the RESOLVED A/AAAA records
// against the same private-range rules immediately before sending. Node-only (uses
// node:dns); kept separate from the pure validate-url module.
import { lookup as dnsLookup } from 'node:dns/promises'
import { isPrivateIpv4, isPrivateIpv6, type UrlCheck } from './validate-url'

type LookupFn = (hostname: string, opts: { all: true }) => Promise<Array<{ address: string; family: number }>>

export async function isResolvedHostSafe(
  hostname: string,
  lookup: LookupFn = dnsLookup as unknown as LookupFn,
): Promise<UrlCheck> {
  let addrs: Array<{ address: string; family: number }>
  try {
    addrs = await lookup(hostname, { all: true })
  } catch {
    return { ok: false, reason: 'DNS resolution failed.' }
  }
  if (addrs.length === 0) return { ok: false, reason: 'DNS resolution returned no addresses.' }
  for (const { address, family } of addrs) {
    const bad = family === 6 ? isPrivateIpv6(address) : isPrivateIpv4(address)
    if (bad) return { ok: false, reason: 'Hostname resolves to a private, loopback, or link-local address.' }
  }
  return { ok: true }
}
