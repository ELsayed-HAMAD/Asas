import { describe, expect, it, vi } from 'vitest'
import { createMailerQueue } from '../src/services/mailerQueue.js'

describe('mailer queue', () => {
  it('delivers inline when pg-boss is not configured', async () => {
    const deliver = vi.fn(async () => undefined)
    const queue = createMailerQueue({ deliver })

    expect(queue.mode).toBe('inline')
    await queue.enqueue({ to: 'ada@example.com', subject: 'Welcome' })
    expect(deliver).toHaveBeenCalledWith({ to: 'ada@example.com', subject: 'Welcome' })
    await queue.start()
    await queue.close()
  })

  it('enqueues messages and delivers them from the pg-boss worker', async () => {
    const send = vi.fn(async () => 'job-1')
    const createQueue = vi.fn(async () => undefined)
    const start = vi.fn(async () => undefined)
    const stop = vi.fn(async () => undefined)
    let worker: ((jobs: Array<{ data: unknown }>) => Promise<void>) | undefined
    const work = vi.fn(async (_name: string, handler: (jobs: Array<{ data: unknown }>) => Promise<void>) => {
      worker = handler
    })
    const deliver = vi.fn(async () => undefined)
    const queue = createMailerQueue({
      url: 'postgres://queue',
      createBoss: () => ({ send, createQueue, start, stop, work }),
      deliver,
    })

    expect(queue.mode).toBe('boss')
    const message = { to: 'ada@example.com', subject: 'Welcome', text: 'Hello' }
    await queue.enqueue(message)
    expect(send).toHaveBeenCalledWith('emails', message, { retryLimit: 3 })
    expect(deliver).not.toHaveBeenCalled()

    await queue.start()
    expect(start).toHaveBeenCalledOnce()
    expect(createQueue).toHaveBeenCalledWith('emails', { retryLimit: 3 })
    expect(work).toHaveBeenCalledOnce()
    await worker?.([{ data: message }])
    expect(deliver).toHaveBeenCalledWith(message)
    await queue.close()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('rejects malformed queued messages rather than passing them to a provider', async () => {
    let worker: ((jobs: Array<{ data: unknown }>) => Promise<void>) | undefined
    const deliver = vi.fn(async () => undefined)
    const queue = createMailerQueue({
      url: 'postgres://queue',
      createBoss: () => ({
        send: async () => 'job-1',
        createQueue: async () => undefined,
        work: async (_name, handler) => { worker = handler },
        start: async () => undefined,
        stop: async () => undefined,
      }),
      deliver,
    })
    await queue.start()
    await expect(worker?.([{ data: { to: 7, subject: 'bad' } }])).rejects.toThrow('Invalid queued email message')
    expect(deliver).not.toHaveBeenCalled()
    await queue.close()
  })
})
