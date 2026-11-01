import { useTranslation } from 'react-i18next'
import { openCookiePreferences } from '../../lib/cookieConsent'

/** Reopens the banner so visitors can change or withdraw their cookie choice later. */
export default function CookieSettingsButton({ className, children }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={openCookiePreferences} className={className}>
      {children ?? t('cookies.settings')}
    </button>
  )
}
