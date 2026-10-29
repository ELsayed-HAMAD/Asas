import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import type { MailerTransport, SendEmailOptions } from './mailer.js'

export interface SmtpTransportConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

/**
 * Generic SMTP transport for deployments without Resend. Works with Gmail app passwords,
 * Brevo, or any standards-compliant SMTP relay. Timeouts are short so a broken relay fails the
 * send instead of holding the request open.
 */
export class SmtpTransport implements MailerTransport {
  private readonly transporter: Transporter

  constructor(config: SmtpTransportConfig) {
    if (!config.host.trim()) throw new Error('SMTP_HOST cannot be empty')
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  }

  async send(message: SendEmailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      ...(message.text !== undefined ? { text: message.text } : {}),
      ...(message.html !== undefined ? { html: message.html } : {}),
    })
  }
}
