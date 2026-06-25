// SSRF guard for tenant-controlled subscriber URLs (#65 Phase 3). Pure: hostname
// pattern + literal-IP range checks only, NO DNS lookups (a DNS-rebind defence
// belongs at fetch time, not here). Rejects http, internal hostnames, and literal
// IPs in private/loopback/link-local/metadata ranges; allows only port 443.

export type UrlCheck = { ok: true } | { ok: false; reason: string }

function reject(reason: string): UrlCheck {
  return { ok: false, reason }
}

export function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  const octets = m.slice(1).map(Number)
  if (octets.some((o) => o > 255)) return false // not a valid IPv4 → not our concern here
  const [a, b] = octets

  if (a === 0) return true // 0.0.0.0/8 (incl. 0.0.0.0)
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 10) return true // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local (incl. metadata)
  return false
}

export function isPrivateIpv6(host: string): boolean {
  // URL keeps IPv6 hostnames bracketed (e.g. "[::1]") — strip them.
  const h = host.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (h === '::1' || h === '::' || h === '::0' || h === '0::0') return true // loopback + unspecified

  // IPv4-mapped IPv6 (::ffff:169.254.169.254) — the classic SSRF bypass into a
  // private/metadata IPv4. Extract the embedded v4 and re-check it.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h)
  if (mapped) return isPrivateIpv4(mapped[1])
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    return isPrivateIpv4(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`)
  }

  const first = h.split(':')[0]
  // Any other compact "::"-leading form (high groups zero) is loopback/mapped
  // territory, never a legit public host → reject conservatively.
  if (first.length === 0) return true
  const prefix = parseInt(first.padEnd(4, '0').slice(0, 4), 16)
  if (Number.isFinite(prefix)) {
    if (prefix >= 0xfc00 && prefix <= 0xfdff) return true // fc00::/7 unique-local
    if (prefix >= 0xfe80 && prefix <= 0xfebf) return true // fe80::/10 link-local
  }
  return false
}

export function isSafeWebhookUrl(url: string): UrlCheck {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return reject('URL is not parseable.')
  }

  if (parsed.protocol !== 'https:') return reject('Only https:// webhook URLs are allowed.')

  if (parsed.port !== '' && parsed.port !== '443') {
    return reject('Only port 443 is allowed.')
  }

  const host = parsed.hostname.toLowerCase()

  if (host === 'localhost') return reject('Loopback hostnames are not allowed.')
  if (host.endsWith('.internal') || host.endsWith('.local')) {
    return reject('Internal hostnames are not allowed.')
  }

  if (isPrivateIpv4(host)) return reject('Private, loopback, or link-local IP addresses are not allowed.')
  if (isPrivateIpv6(host)) return reject('Private, loopback, or link-local IP addresses are not allowed.')

  return { ok: true }
}
