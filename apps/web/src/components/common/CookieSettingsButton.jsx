import { openCookiePreferences } from '../../lib/cookieConsent'

/** Reopens the banner so visitors can change or withdraw their cookie choice later. */
export default function CookieSettingsButton({ className, children = 'Cookie settings' }) {
  return (
    <button type="button" onClick={openCookiePreferences} className={className}>
      {children}
    </button>
  )
}
