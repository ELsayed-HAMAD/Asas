import { describe, expect, it } from 'vitest'
import { MailerService } from '../src/services/mailer.js'

describe('mailer service', () => {
  it('records sent emails in history with unique ids and timestamps', async () => {
    const mailer = new MailerService('noreply@test.asas')
    expect(mailer.getSentEmails()).toHaveLength(0)

    const record = await mailer.send({
      to: 'ada@example.com',
      subject: 'Welcome to Asas',
      text: 'Hello Ada',
    })

    expect(record.to).toBe('ada@example.com')
    expect(record.subject).toBe('Welcome to Asas')
    expect(record.from).toBe('noreply@test.asas')
    expect(record.id).toMatch(/^mail_/)
    expect(record.sentAt).toBeInstanceOf(Date)

    const history = mailer.getSentEmails()
    expect(history).toHaveLength(1)
    expect(history[0]?.id).toBe(record.id)
  })

  it('delegates to custom transport when configured', async () => {
    const calls: Array<{ to: string; subject: string }> = []
    const mailer = new MailerService('noreply@test.asas', {
      send: async (options) => {
        calls.push({ to: options.to, subject: options.subject })
      },
    })

    await mailer.send({
      to: 'charles@example.com',
      subject: 'Password Reset',
    })

    expect(calls).toEqual([{ to: 'charles@example.com', subject: 'Password Reset' }])
  })

  it('clears email history on request', async () => {
    const mailer = new MailerService()
    await mailer.send({ to: 'test@example.com', subject: 'Test' })
    expect(mailer.getSentEmails()).toHaveLength(1)

    mailer.clearSentEmails()
    expect(mailer.getSentEmails()).toHaveLength(0)
  })

  it('enqueues to boss queue when queue is configured, or dispatches directly when null', async () => {
    const queueCalls: Array<{ queue: string; data: unknown }> = []
    const fakeQueue = {
      send: async (queue: string, data: unknown) => {
        queueCalls.push({ queue, data })
      },
    }
    const mailer = new MailerService('noreply@test.asas', undefined, fakeQueue)
    await mailer.enqueue({ to: 'queue@example.com', subject: 'Queued message' })
    expect(queueCalls).toEqual([{ queue: 'emails', data: { to: 'queue@example.com', subject: 'Queued message' } }])
    expect(mailer.getSentEmails()).toHaveLength(0)

    mailer.setQueue(null)
    await mailer.enqueue({ to: 'direct@example.com', subject: 'Direct message' })
    expect(mailer.getSentEmails()).toHaveLength(1)
  })
})
