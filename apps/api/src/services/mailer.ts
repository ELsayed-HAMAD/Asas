/**
 * Asas Mailer & Notification Service.
 *
 * Provides transactional email dispatch across the platform:
 * - Better Auth reset password, email verification, and workspace invites.
 * - AR overdue payment reminders.
 * - System and security alerts.
 *
 * Features:
 * - In-memory sent message ring buffer for deterministic test verification.
 * - Custom transport support (SMTP, console, mock).
 * - Integration with pg-boss job queue when available.
 */

export interface SendEmailOptions {
  to: string
  subject: string
  text?: string | undefined
  html?: string | undefined
  from?: string | undefined
  metadata?: Record<string, unknown> | undefined
}

export interface SentEmailRecord extends SendEmailOptions {
  id: string
  sentAt: Date
}

export interface MailerTransport {
  send(options: SendEmailOptions): Promise<void>
}

export interface BossQueueClient {
  send(queueName: string, data: unknown, options?: unknown): Promise<unknown>
}

export class MailerService {
  private sentHistory: SentEmailRecord[] = []
  private maxHistorySize = 100
  private defaultFrom: string = 'noreply@asas.app'
  private transport: MailerTransport | null = null
  private queue: BossQueueClient | null = null

  constructor(defaultFrom = 'noreply@asas.app', transport?: MailerTransport, queue?: BossQueueClient) {
    this.defaultFrom = defaultFrom
    this.transport = transport ?? null
    this.queue = queue ?? null
  }

  setTransport(transport: MailerTransport): void {
    this.transport = transport
  }

  setQueue(queue: BossQueueClient | null): void {
    this.queue = queue
  }

  async enqueue(options: SendEmailOptions): Promise<void> {
    if (this.queue) {
      await this.queue.send('emails', options)
    } else {
      await this.send(options)
    }
  }

  async send(options: SendEmailOptions): Promise<SentEmailRecord> {
    const record: SentEmailRecord = {
      ...options,
      from: options.from || this.defaultFrom,
      id: `mail_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      sentAt: new Date(),
    }

    if (this.transport) {
      await this.transport.send(record)
    }

    this.sentHistory.push(record)
    if (this.sentHistory.length > this.maxHistorySize) {
      this.sentHistory.shift()
    }

    return record
  }

  getSentEmails(): readonly SentEmailRecord[] {
    return [...this.sentHistory]
  }

  clearSentEmails(): void {
    this.sentHistory = []
  }
}

export const mailer = new MailerService()
