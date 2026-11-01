import { Activity, Cookie, LockKeyhole } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Switch } from '../ui/switch'
import {
  OPEN_COOKIE_PREFERENCES_EVENT,
  readCookieConsent,
  saveCookieConsent,
} from '../../lib/cookieConsent'
import { syncSentryConsent } from '../../lib/sentry'

const HIDDEN_PREFIXES = ['/dashboard', '/onboarding', '/choose-workspace', '/admin']

export default function CookieConsent() {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const savedConsent = readCookieConsent()
  const [visible, setVisible] = useState(() => !savedConsent)
  const [expanded, setExpanded] = useState(false)
  const [analytics, setAnalytics] = useState(() => savedConsent?.analytics ?? false)
  const [error, setError] = useState('')
  const headingRef = useRef(null)
  const hidden = HIDDEN_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))

  useEffect(() => {
    const openPreferences = () => {
      setAnalytics(readCookieConsent()?.analytics ?? false)
      setError('')
      setExpanded(true)
      setVisible(true)
      window.setTimeout(() => headingRef.current?.focus(), 0)
    }
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, openPreferences)
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, openPreferences)
  }, [])

  if (hidden || !visible) return null

  function expandPreferences() {
    setError('')
    setExpanded(true)
    window.setTimeout(() => headingRef.current?.focus(), 0)
  }

  function persist(nextAnalytics) {
    const saved = saveCookieConsent({ analytics: nextAnalytics })
    if (!saved) {
      setError(t('cookies.storageError'))
      return
    }
    setAnalytics(nextAnalytics)
    syncSentryConsent()
    setVisible(false)
  }

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-center p-3 sm:p-4"
    >
      <div className="pointer-events-auto w-full max-w-[840px] animate-fade-in-up rounded-[24px] border border-border-default/80 bg-surface-raised/95 p-3.5 text-body shadow-elevated backdrop-blur-2xl sm:p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-primary text-on-primary shadow-card">
            <Cookie size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="cookie-consent-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-sm font-semibold tracking-[-0.01em] text-heading focus:outline-none sm:text-base"
            >
              {t('cookies.title')}
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-muted sm:text-[13px]">
              {t('cookies.body')}{' '}
              <Link to="/privacy" className="font-semibold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
                {t('cookies.privacyPolicy')}
              </Link>
            </p>

            {expanded && (
              <div className="mt-3 rounded-[16px] border border-border-subtle bg-surface-muted/70 p-3">
                <div className="flex items-start gap-3 border-b border-border-subtle pb-3">
                  <LockKeyhole size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-heading">{t('cookies.essential')}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted">{t('cookies.essentialBody')}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{t('cookies.alwaysOn')}</Badge>
                </div>
                <div className="flex items-start gap-3 pt-3">
                  <Activity size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-heading">{t('cookies.analytics')}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted">{t('cookies.analyticsBody')}</p>
                  </div>
                  <Switch
                    id="cookie-analytics"
                    color="primary"
                    checked={analytics}
                    onCheckedChange={setAnalytics}
                    aria-label={t('cookies.allowAnalytics')}
                    className="mt-0.5 shrink-0"
                  />
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-2.5 text-xs font-medium text-danger-text">{error}</p>
            )}

            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {!expanded && (
                <button
                  type="button"
                  onClick={expandPreferences}
                  className="h-9 px-3 text-xs font-semibold text-body transition-colors hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:me-auto"
                >
                  {t('cookies.manage')}
                </button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => persist(false)}
                className="h-9 px-4 text-xs"
              >
                {t('cookies.essentialOnly')}
              </Button>
              {expanded ? (
                <Button
                  type="button"
                  onClick={() => persist(analytics)}
                  className="h-9 px-5 text-xs"
                >
                  {t('cookies.save')}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => persist(true)}
                  className="h-9 px-5 text-xs"
                >
                  {t('cookies.acceptAll')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
