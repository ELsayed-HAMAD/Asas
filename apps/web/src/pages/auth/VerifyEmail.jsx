import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { MailCheck, Mail, ExternalLink, Loader2, CheckCircle2, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react'
import { authClient, useSession, signOut } from '../../lib/authClient'
import { authErrorMessage } from '../../lib/authErrorMessage'
import { getSafeAuthCallbackPath } from '../../lib/authRedirect'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Alert, AlertDescription } from '../../components/ui/alert'

function getMailProvider(email = '') {
  const domain = (email.split('@')[1] || '').toLowerCase()
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return { name: 'Gmail', url: 'https://mail.google.com' }
  }
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) {
    return { name: 'Outlook', url: 'https://outlook.live.com' }
  }
  if (['yahoo.com', 'ymail.com'].includes(domain)) {
    return { name: 'Yahoo Mail', url: 'https://mail.yahoo.com' }
  }
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) {
    return { name: 'iCloud Mail', url: 'https://www.icloud.com/mail' }
  }
  if (domain.includes('proton') || domain.includes('pm.me')) {
    return { name: 'Proton Mail', url: 'https://mail.proton.me' }
  }
  return { name: 'Email Inbox', url: null }
}

export default function VerifyEmail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const { data: session } = useSession()

  const searchParams = new URLSearchParams(location.search)
  const email = location.state?.email || searchParams.get('email') || session?.user?.email || ''
  const callbackPath = getSafeAuthCallbackPath(
    location.state?.callbackURL || searchParams.get('callbackURL'),
    window.location.origin,
  )
  const callbackURL = `${window.location.origin}${callbackPath}`
  const isInvitationFlow = callbackPath.startsWith('/accept-invitation?')
  const provider = getMailProvider(email)

  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // If already verified, offer direct jump to dashboard
  const isAlreadyVerified = session?.user?.emailVerified

  const handleResend = async () => {
    if (!email || countdown > 0 || isResending) return
    setIsResending(true)
    setResendMessage('')
    setResendError('')

    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL,
      })

      if (result?.error) {
        throw new Error(authErrorMessage(result.error, t('auth.verify.errors.resendFailed')))
      }

      setResendMessage(t('auth.verify.resendSent', { email }))
      setCountdown(60)
    } catch (err) {
      setResendError(authErrorMessage(err, t('auth.verify.errors.resendError')))
    } finally {
      setIsResending(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } finally {
      navigate('/login')
    }
  }

  return (
    <div className="flex flex-col text-center">
      {/* Icon Badge */}
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MailCheck size={32} />
      </div>

      {/* Header */}
      <h1 className="mb-2 text-2xl font-semibold text-heading">
        {provider.name === 'Gmail' ? t('auth.verify.confirmGmail') : t('auth.verify.confirmEmail')}
      </h1>
      <p className="mb-4 text-sm text-muted">
        {isInvitationFlow ? t('auth.verify.bodyInvitation') : t('auth.verify.bodySetup')}
      </p>

      {/* Email pill */}
      {email ? (
        <div className="mb-6 self-center">
          <Badge variant="outline" dir="ltr" className="px-3.5 py-1 text-sm font-medium text-heading">
            {email}
          </Badge>
        </div>
      ) : (
        <p className="mb-6 text-xs text-muted">
          {t('auth.verify.checkInbox')}
        </p>
      )}

      {/* Status Notifications */}
      {resendMessage && (
        <Alert variant="success" className="mb-5 text-start">
          <CheckCircle2 size={16} />
          <AlertDescription>{resendMessage}</AlertDescription>
        </Alert>
      )}

      {resendError && (
        <Alert variant="destructive" className="mb-5 text-start">
          <AlertCircle size={16} />
          <AlertDescription>{resendError}</AlertDescription>
        </Alert>
      )}

      {isAlreadyVerified && (
        <Alert variant="info" className="mb-5 text-start">
          <CheckCircle2 size={16} />
          <AlertDescription>{t('auth.verify.alreadyVerified')}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="mb-6 space-y-3">
        {provider.url ? (
          <Button asChild className="h-10 w-full font-medium">
            <a
              href={provider.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2"
            >
              <span>{t('auth.verify.openProvider', { provider: provider.name })}</span>
              <ExternalLink size={15} />
            </a>
          </Button>
        ) : (
          <div className="rounded-button border border-border-subtle bg-surface-muted/50 px-4 py-3 text-start">
            <div className="flex items-start gap-2.5">
              <Mail size={16} className="mt-0.5 shrink-0 text-muted" />
              <div>
                <p className="text-xs font-medium text-body">{t('auth.verify.manualTitle')}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {email
                    ? t('auth.verify.manualBodyEmail', { email })
                    : t('auth.verify.manualBody')}
                </p>
              </div>
            </div>
          </div>
        )}

        {session?.user ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(callbackPath)}
            className="h-10 w-full font-medium"
          >
            <span>{isInvitationFlow ? t('auth.verify.continueToInvitation') : t('auth.verify.continueToSetup')}</span>
            <ArrowRight size={15} className="rtl:-scale-x-100" />
          </Button>
        ) : (
          <Button
            asChild
            variant="outline"
            className="h-10 w-full font-medium"
          >
            <Link to="/login" className="flex items-center justify-center gap-2">
              <span>{t('auth.verify.alreadyConfirmed')}</span>
              <ArrowRight size={15} className="rtl:-scale-x-100" />
            </Link>
          </Button>
        )}
      </div>

      {/* Instructions list */}
      <div className="mb-6 space-y-1.5 rounded-button border border-border-subtle bg-surface-muted/50 p-3.5 text-start text-xs text-muted">
        <p className="font-medium text-body">{t('auth.verify.nextSteps')}</p>
        <p><Trans i18nKey="auth.verify.step1" components={{ strong: <strong /> }} /></p>
        <p><Trans i18nKey="auth.verify.step2" components={{ strong: <strong /> }} /></p>
        <p>{t('auth.verify.step3')}</p>
      </div>

      {/* Resend Action */}
      <div className="mb-4 text-center text-xs text-muted">
        {t('auth.verify.didntReceive')}{' '}
        <Button
          type="button"
          variant="link"
          disabled={isResending || countdown > 0 || !email}
          onClick={handleResend}
          className="inline-flex items-center gap-1 text-xs font-medium text-heading hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResending ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>{t('auth.verify.sending')}</span>
            </>
          ) : countdown > 0 ? (
            <span>{t('auth.verify.resendIn', { seconds: countdown })}</span>
          ) : (
            <>
              <RefreshCw size={12} />
              <span>{t('auth.verify.resend')}</span>
            </>
          )}
        </Button>
      </div>

      {/* Sign Out / Change Email */}
      <div className="border-t border-border-subtle pt-2 text-center text-xs text-caption">
        {t('auth.verify.wrongEmail')}{' '}
        <Button
          type="button"
          variant="link"
          onClick={handleSignOut}
          className="text-xs font-medium text-body hover:underline"
        >
          {t('auth.verify.signOutSwitch')}
        </Button>
      </div>
    </div>
  )
}
