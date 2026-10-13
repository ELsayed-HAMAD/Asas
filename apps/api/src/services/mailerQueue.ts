import { createRequire } from 'node:module'
import type { FastifyInstance } from 'fastify'
import { mailer, type BossQueueClient, type SendEmailOptions } from './mailer.js'

const require = createRequire(import.meta.url)
const EMAIL_QUEUE = 'emails'

interface BossClient extends BossQueueClient {
  createQueue(name: string, options: unknown): Promise<unknown>
  work(queue: string, handler: (jobs: Array<{ data: unknown }>) => Promise<void>): Promise<unknown>
  start(): Promise<unknown>
  stop(): Promise<void>
}

export interface MailerQueue {
  readonly mode: 'boss' | 'inline'
  send(queueName: string, payload: unknown, options?: unknown): Promise<unknown>
  enqueue(message: SendEmailOptions): Promise<void>
  start(): Promise<void>
  close(): Promise<void>
}

export interface CreateMailerQueueOptions {
  url?: string | undefined
  createBoss?: ((url: string) => BossClient) | undefined
  deliver?: ((message: SendEmailOptions) => Promise<unknown>) | undefined
}

function isEmailMessage(value: unknown): value is SendEmailOptions {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return typeof message.to === 'string'
    && typeof message.subject === 'string'
    && (message.text === undefined || typeof message.text === 'string')
    && (message.html === undefined || typeof message.html === 'string')
    && (message.from === undefined || typeof message.from === 'string')
}

export function createMailerQueue(options: CreateMailerQueueOptions): MailerQueue {
  const { url, deliver = message => mailer.deliver(message) } = options
  const boss = url
    ? (options.createBoss ?? (connectionString => {
        const PgBoss = require('pg-boss') as new (config: unknown) => BossClient
        return new PgBoss({ connectionString, schema: 'asas_boss' })
      }))(url)
    : null

  return {
    mode: boss ? 'boss' : 'inline',
    async send(queueName, payload, queueOptions) {
      if (queueName !== EMAIL_QUEUE) throw new Error(`Unsupported mail queue '${queueName}'`)
      if (!isEmailMessage(payload)) throw new Error('Invalid email message')
      if (boss) return boss.send(EMAIL_QUEUE, payload, queueOptions ?? { retryLimit: 3 })
      await deliver(payload)
      return undefined
    },
    async enqueue(message) {
      if (!isEmailMessage(message)) throw new Error('Invalid email message')
      if (boss) {
        await boss.send(EMAIL_QUEUE, message, { retryLimit: 3 })
      } else {
        await deliver(message)
      }
    },
    async start() {
      if (!boss) return
      await boss.start()
      await boss.createQueue(EMAIL_QUEUE, { retryLimit: 3 })
      await boss.work(EMAIL_QUEUE, async jobs => {
        for (const job of jobs) {
          if (!isEmailMessage(job.data)) throw new Error('Invalid queued email message')
          await deliver(job.data)
        }
      })
    },
    async close() {
      if (boss) await boss.stop()
    },
  }
}

export async function mailerQueuePlugin(
  app: FastifyInstance,
  options: { queueUrl?: string | undefined },
): Promise<void> {
  const queue = createMailerQueue({ url: options.queueUrl })
  mailer.setQueue(queue)
  app.addHook('onReady', () => queue.start())
  app.addHook('onClose', async () => {
    await queue.close()
    mailer.setQueue(null)
  })
}
