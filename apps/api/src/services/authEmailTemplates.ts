function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

interface EmailLayoutOptions {
  badge: string
  title: string
  greeting: string
  bodyHtml: string
  actionText: string
  actionUrl: string
  footnote?: string
}

function renderEmailLayout(options: EmailLayoutOptions): string {
  const safeUrl = escapeHtml(options.actionUrl)
  const safeBadge = escapeHtml(options.badge)
  const safeTitle = escapeHtml(options.title)
  const safeGreeting = options.greeting // already escaped
  const safeActionText = escapeHtml(options.actionText)
  const safeFootnote = options.footnote
    ? escapeHtml(options.footnote)
    : 'This link is valid for 24 hours. If you did not request this, you can safely ignore this email.'

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; padding: 16px !important; }
      .email-card { padding: 28px 20px !important; }
      .email-cta { width: 100% !important; display: block !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #0f172a;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -2px rgba(15, 23, 42, 0.05);" class="email-container">

          <!-- Header / Brand -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #f1f5f9;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 34px; height: 34px; background-color: #0f172a; border-radius: 8px; text-align: center; vertical-align: middle;">
                          <span style="color: #ffffff; font-weight: 700; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">A</span>
                        </td>
                        <td style="padding-left: 10px;">
                          <span style="font-size: 17px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">Asas</span>
                          <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; background-color: #f1f5f9; padding: 2px 7px; border-radius: 4px; margin-left: 6px;">Enterprise</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 40px 32px 40px;" class="email-card">
              <!-- Pill Badge -->
              <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="background-color: #eff6ff; border: 1px solid #dbeafe; border-radius: 20px; padding: 4px 12px;">
                    <span style="font-size: 12px; font-weight: 600; color: #2563eb; letter-spacing: 0.02em;">${safeBadge}</span>
                  </td>
                </tr>
              </table>

              <!-- Heading -->
              <h1 style="margin: 0 0 16px 0; font-size: 23px; font-weight: 700; color: #0f172a; line-height: 1.3; letter-spacing: -0.02em;">
                ${safeTitle}
              </h1>

              <!-- Greeting -->
              <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: 500; color: #1e293b; line-height: 24px;">
                ${safeGreeting}
              </p>

              <!-- Body Copy -->
              <div style="margin: 0 0 28px 0; font-size: 15px; color: #475569; line-height: 24px;">
                ${options.bodyHtml}
              </div>

              <!-- Button CTA (Bulletproof Table) -->
              <table border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 32px 0;">
                <tr>
                  <td align="center" style="background-color: #0f172a; border-radius: 8px;">
                    <a href="${safeUrl}" target="_blank" style="display: inline-block; padding: 13px 30px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; border: 1px solid #0f172a; letter-spacing: -0.01em;" class="email-cta">
                      ${safeActionText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Callout Footnote Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 24px 0 20px 0;">
                <tr>
                  <td style="padding: 14px 16px; font-size: 12px; color: #64748b; line-height: 18px;">
                    <strong style="color: #475569;">Security Notice:</strong> ${safeFootnote}
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct Link -->
              <p style="margin: 20px 0 6px 0; font-size: 12px; color: #64748b; line-height: 18px;">
                If the button above does not work, copy and paste this URL into your browser:
              </p>
              <p style="margin: 0; font-size: 12px; color: #2563eb; word-break: break-all; line-height: 18px;">
                <a href="${safeUrl}" style="color: #2563eb; text-decoration: underline;">${safeUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 500; color: #64748b;">
                Asas Enterprise ERP &bull; Unified Operations Platform
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 16px;">
                &copy; ${new Date().getFullYear()} Asas Inc. All rights reserved. This is an automated transactional message.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function passwordResetHtml(name: string | null | undefined, url: string): string {
  const greeting = `Hello ${escapeHtml(name || 'there')},`
  const bodyHtml = `<p style="margin: 0 0 12px 0;">We received a request to reset the password for your Asas account.</p><p style="margin: 0;">Click below to choose a new password and regain access to your workspace:</p>`
  return renderEmailLayout({
    badge: 'Password Reset',
    title: 'Reset your Asas password',
    greeting,
    bodyHtml,
    actionText: 'Reset Password',
    actionUrl: url,
    footnote: 'This password reset link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.',
  })
}

export function emailVerificationHtml(name: string | null | undefined, url: string): string {
  const greeting = `Hello ${escapeHtml(name || 'there')},`
  const bodyHtml = `<p style="margin: 0 0 12px 0;">Welcome to Asas! You are just one step away from activating your enterprise workspace.</p><p style="margin: 0;">Click below to verify your email address and proceed with onboarding:</p>`
  return renderEmailLayout({
    badge: 'Account Verification',
    title: 'Verify your Asas email address',
    greeting,
    bodyHtml,
    actionText: 'Verify Email',
    actionUrl: url,
    footnote: 'This verification link expires in 24 hours. Once verified, you will be automatically redirected to your onboarding workspace.',
  })
}

export function invitationHtml(organizationName: string, role: string, url: string): string {
  const greeting = `Hello there,`
  const bodyHtml = `<p style="margin: 0 0 12px 0;">You have been invited to join <strong>${escapeHtml(organizationName)}</strong> as ${escapeHtml(role)}.</p><p style="margin: 0;">Join your team on Asas to collaborate on finances, HR, projects, and enterprise workflows:</p>`
  return renderEmailLayout({
    badge: 'Team Invitation',
    title: `Invitation to join ${escapeHtml(organizationName)}`,
    greeting,
    bodyHtml,
    actionText: 'Accept Invitation',
    actionUrl: url,
    footnote: 'This invitation was sent by your workspace administrator. If you believe this was sent in error, you can safely ignore it.',
  })
}
