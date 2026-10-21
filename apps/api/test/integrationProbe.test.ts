import { describe, expect, it, vi } from 'vitest'
import { probePublicHttpsEndpoint } from '../src/modules/settings/integrationProbe.js'

describe('public integration endpoint probes', () => {
  it('sends to the exact public address resolved for the configured host', async () => {
    const send = vi.fn().mockResolvedValue(204)
    const resolve = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

    const status = await probePublicHttpsEndpoint('https://hooks.example.com:8443/asas/ping?source=settings', { resolve, send })

    expect(status).toBe(204)
    expect(resolve).toHaveBeenCalledWith('hooks.example.com')
    expect(send).toHaveBeenCalledWith(
      new URL('https://hooks.example.com:8443/asas/ping?source=settings'),
      { address: '93.184.216.34', family: 4 },
    )
  })

  it('rejects a DNS answer set containing any private address before sending', async () => {
    const send = vi.fn()
    const resolve = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.20.30.40', family: 4 },
    ])

    await expect(probePublicHttpsEndpoint('https://hooks.example.com/ping', { resolve, send }))
      .rejects.toThrow('Private integration endpoints cannot be probed')
    expect(send).not.toHaveBeenCalled()
  })

  it.each(['2002:c000:0201::1', '2001:db8::1', '2001:100::1'])('rejects IPv6 special range %s', async (address) => {
    const send = vi.fn()
    const resolve = vi.fn().mockResolvedValue([{ address, family: 6 }])

    await expect(probePublicHttpsEndpoint('https://hooks.example.com/ping', { resolve, send }))
      .rejects.toThrow('Private integration endpoints cannot be probed')
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    'http://hooks.example.com/ping',
    'https://user:secret@hooks.example.com/ping',
    'https://localhost/ping',
    'https://hooks.local/ping',
  ])('rejects unsupported endpoint URL %s before DNS resolution', async (target) => {
    const resolve = vi.fn()
    const send = vi.fn()

    await expect(probePublicHttpsEndpoint(target, { resolve, send })).rejects.toThrow()
    expect(resolve).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
