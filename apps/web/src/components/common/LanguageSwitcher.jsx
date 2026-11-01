import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { changeLanguage } from '../../lib/i18n'

/**
 * Compact language toggle for pages outside the dashboard shell (auth, onboarding).
 * The dashboard header keeps its richer menu item, which shows both codes.
 */
export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation()
  const isArabic = i18n.language === 'ar'

  return (
    <button
      type="button"
      data-testid="language-switcher"
      onClick={() => changeLanguage(isArabic ? 'en' : 'ar')}
      aria-label={isArabic ? 'Switch to English' : 'التحويل إلى العربية'}
      className={`inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] font-medium text-ink-muted transition-colors hover:bg-white hover:text-action ${className}`}
    >
      <Globe size={12} aria-hidden="true" />
      <span>{isArabic ? 'English' : 'العربية'}</span>
    </button>
  )
}
