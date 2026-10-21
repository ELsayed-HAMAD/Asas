import { lookup } from 'node:dns/promises'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { isIP } from 'node:net'

type ProbeAddress = { address: string; family: number }
type ProbeDependencies = {
  resolve: (hostname: string) => Promise<ProbeAddress[]>
  send: (url: URL, address: ProbeAddress) => Promise<number>
}

function isPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    const octets = address.split('.').map(Number) as [number, number, number, number]
    const [a, b, c] = octets
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99))) return false
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false
    if (a === 203 && b === 0 && c === 113) return false
    return true
  }
  if (version === 6) {
    const normalized = address.toLowerCase()
    const [left = '', right] = normalized.split('::')
    const leftWords = left.split(':').filter(Boolean)
    const rightWords = right?.split(':').filter(Boolean) ?? []
    const omittedWords = 8 - leftWords.length - rightWords.length
    if (omittedWords < 0) return false
    const words = [...leftWords, ...Array.from({ length: omittedWords }, () => '0'), ...rightWords]
    const first = Number.parseInt(words[0] ?? '0', 16)
    const second = Number.parseInt(words[1] ?? '0', 16)
    // Permit global unicast only. Exclude special protocol allocations, documentation,
    // and the IPv4 transition mechanism that can tunnel to otherwise private IPv4 targets.
    if (first < 0x2000 || first > 0x3fff) return false
    if (first === 0x2002 || first === 0x3fff && second < 0x1000) return false
    if (first === 0x2001 && (second <= 0x01ff || second === 0x0020 || second === 0x0db8)) return false
    return true
  }
  return false
}

async function resolvePublicHost(hostname: string): Promise<ProbeAddress[]> {
  const family = isIP(hostname)
  return family
    ? [{ address: hostname, family }]
    : await lookup(hostname, { all: true, verbatim: true })
}

function sendPinnedHttpsProbe(url: URL, address: ProbeAddress): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false
    const path = `${url.pathname}${url.search}` || '/'
    const options: RequestOptions = {
      protocol: 'https:',
      hostname: address.address,
      family: address.family,
      port: url.port ? Number(url.port) : 443,
      path,
      method: 'POST',
      headers: {
        host: url.host,
        'content-type': 'application/json',
        'user-agent': 'Asas-Integration-Probe/1.0',
      },
      // Connect to the resolved IP, but validate the TLS certificate for the configured host.
      servername: isIP(url.hostname) ? undefined : url.hostname,
      rejectUnauthorized: true,
      agent: false,
    }
    const request = httpsRequest(options, (response) => {
      settled = true
      const statusCode = response.statusCode ?? 502
      // Probe responses are not application data. Close the body without buffering arbitrary size.
      response.destroy()
      resolve(statusCode)
    })
    request.setTimeout(5000, () => {
      const timeoutError = new Error('Integration probe timed out')
      timeoutError.name = 'TimeoutError'
      request.destroy(timeoutError)
    })
    request.once('error', (error) => {
      if (!settled) reject(error)
    })
    request.end(JSON.stringify({ event: 'ping', timestamp: new Date().toISOString() }))
  })
}

const defaultDependencies: ProbeDependencies = {
  resolve: resolvePublicHost,
  send: sendPinnedHttpsProbe,
}

/** Resolve once, reject non-public answers, and send to one of those exact addresses. */
export async function probePublicHttpsEndpoint(
  target: string,
  dependencies: ProbeDependencies = defaultDependencies,
): Promise<number> {
  const url = new URL(target)
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) {
    throw new Error('Integration probes require a public HTTPS endpoint')
  }
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Private integration endpoints cannot be probed')
  }
  const addresses = await dependencies.resolve(hostname)
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Private integration endpoints cannot be probed')
  }
  return dependencies.send(url, addresses[0]!)
}
