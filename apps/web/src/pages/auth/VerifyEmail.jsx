import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { MailCheck, ExternalLink, Loader2, CheckCircle2, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react'
import { authClient, useSession, signOut } from '../../lib/authClient'
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
  const { data: session } = useSession()

  const searchParams = new URLSearchParams(location.search)
  const email = location.state?.email || searchParams.get('email') || session?.user?.email || ''
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
        callbackURL: `${window.location.origin}/dashboard`,
      })

      if (result?.error) {
        throw new Error(result.error.message || 'Unable to resend verification email.')
      }

      setResendMessage(`A fresh verification link was sent to ${email}.`)
      setCountdown(60)
    } catch (err) {
      setResendError(err?.message || 'Failed to resend verification email. Please try again.')
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
      <h1 className="text-2xl font-semibold text-heading mb-2">
        {provider.name === 'Gmail' ? 'Confirm your Gmail' : 'Confirm your email'}
      </h1>
      <p className="text-sm text-muted mb-4">
        A confirmation email has been sent to activate your account. Please confirm your email using {provider.name}, then proceed to onboarding.
      </p>

      {/* Email pill */}
      {email ? (
        <div className="mb-6 self-center">
          <Badge variant="outline" className="px-3.5 py-1 text-sm font-medium text-heading">
            {email}
          </Badge>
        </div>
      ) : (
        <p className="text-xs text-muted mb-6">
          Please check the inbox associated with your account.
        </p>
      )}

      {/* Status Notifications */}
      {resendMessage && (
        <Alert variant="success" className="mb-5 text-left">
          <CheckCircle2 size={16} />
          <AlertDescription>{resendMessage}</AlertDescription>
        </Alert>
      )}

      {resendError && (
        <Alert variant="destructive" className="mb-5 text-left">
          <AlertCircle size={16} />
          <AlertDescription>{resendError}</AlertDescription>
        </Alert>
      )}

      {isAlreadyVerified && (
        <Alert variant="info" className="mb-5 text-left">
          <CheckCircle2 size={16} />
          <AlertDescription>Your email is already verified!</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="space-y-3 mb-6">
        {provider.url ? (
          <Button asChild className="w-full h-10 font-medium">
            <a
              href={provider.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2"
            >
              <span>Open {provider.name}</span>
              <ExternalLink size={15} />
            </a>
          </Button>
        ) : (
          <Button asChild className="w-full h-10 font-medium">
            <a
              href={`mailto:${email}`}
              className="flex items-center justify-center gap-2"
            >
              <span>Open Email Inbox</span>
              <ExternalLink size={15} />
            </a>
          </Button>
        )}

        {session?.user ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/onboarding')}
            className="w-full h-10 font-medium"
          >
            <span>Continue to Onboarding</span>
            <ArrowRight size={15} />
          </Button>
        ) : (
          <Button
            asChild
            variant="outline"
            className="w-full h-10 font-medium"
          >
            <Link to="/login" className="flex items-center justify-center gap-2">
              <span>Already confirmed? Go to Login</span>
              <ArrowRight size={15} />
            </Link>
          </Button>
        )}
      </div>

      {/* Instructions list */}
      <div className="p-3.5 mb-6 rounded-button bg-surface-muted/50 border border-border-subtle text-left text-xs text-muted space-y-1.5">
        <p className="font-medium text-body">Next steps:</p>
        <p>1. Open the email from <strong>Asas</strong> (<code className="text-[11px]">onboarding@resend.dev</code>).</p>
        <p>2. Click the <strong>Verify Email</strong> button inside.</p>
        <p>3. If you do not see it within a minute, check your Spam or Junk folder.</p>
      </div>

      {/* Resend Action */}
      <div className="text-center text-xs text-muted mb-4">
        Didn't receive the email?{' '}
        <Button
          type="button"
          variant="link"
          disabled={isResending || countdown > 0 || !email}
          onClick={handleResend}
          className="font-medium text-heading hover:underline disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1 text-xs"
        >
          {isResending ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>Sending...</span>
            </>
          ) : countdown > 0 ? (
            <span>Resend in {countdown}s</span>
          ) : (
            <>
              <RefreshCw size={12} />
              <span>Resend verification email</span>
            </>
          )}
        </Button>
      </div>

      {/* Sign Out / Change Email */}
      <div className="pt-2 border-t border-border-subtle text-center text-xs text-caption">
        Wrong email address?{' '}
        <Button
          type="button"
          variant="link"
          onClick={handleSignOut}
          className="font-medium text-body hover:underline text-xs"
        >
          Sign out and switch account
        </Button>
      </div>
    </div>
  )
}
