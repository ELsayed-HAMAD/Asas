import type { MailerTransport, SendEmailOptions } from './mailer.js'

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** Resend HTTP API transport; uses Node's built-in fetch so no runtime SDK is required. */
export class ResendTransport implements MailerTransport {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch,
  ) {
    if (!apiKey.trim()) throw new Error('RESEND_API_KEY cannot be empty')
  }

  async send(message: SendEmailOptions): Promise<void> {
    const response = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        ...(message.text !== undefined && { text: message.text }),
        ...(message.html !== undefined && { html: message.html }),
      }),
    })

    if (!response.ok) {
      // Do not include response bodies; provider errors can echo recipient or message data.
      throw new Error(`Resend email delivery failed with HTTP ${response.status}`)
    }
  }
}
