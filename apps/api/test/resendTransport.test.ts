import { describe, expect, it, vi } from 'vitest'
import { ResendTransport } from '../src/services/resendTransport.js'

describe('ResendTransport', () => {
  it('sends the message to Resend with the configured credentials and sender', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }))
    const transport = new ResendTransport('re_test_key', fetcher)

    await transport.send({
      from: 'Asas <verified@example.com>',
      to: 'ada@example.com',
      subject: 'Welcome',
      text: 'Hello Ada',
      html: '<p>Hello Ada</p>',
    })

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.resend.com/emails')
    expect(init?.headers).toEqual({
      Authorization: 'Bearer re_test_key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Asas <verified@example.com>',
      to: ['ada@example.com'],
      subject: 'Welcome',
      text: 'Hello Ada',
      html: '<p>Hello Ada</p>',
    })
  })

  it('fails delivery on provider errors without exposing the provider response body', async () => {
    const fetcher = vi.fn(async () => new Response('recipient-specific diagnostic', { status: 429 }))
    const transport = new ResendTransport('re_test_key', fetcher)

    await expect(transport.send({ to: 'ada@example.com', subject: 'Welcome' }))
      .rejects.toThrow('Resend email delivery failed with HTTP 429')
  })

  it('rejects an empty API key at construction', () => {
    expect(() => new ResendTransport('  ')).toThrow('RESEND_API_KEY cannot be empty')
  })
})
