import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { setFormatDefaults } from './format.js'
import en from '../locales/en.json' with { type: 'json' }
import ar from '../locales/ar.json' with { type: 'json' }

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
]

export const resources = {
  en: { translation: en },
  ar: { translation: ar },
}

/** Locale used for `Intl` formatting. Arabic keeps Western digits for ERP consistency. */
export function formatLocaleFor(lng) {
  return lng === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'
}

export function applyLanguageDirection(lng) {
  const isArabic = lng === 'ar'
  const dir = isArabic ? 'rtl' : 'ltr'
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng
    document.documentElement.dir = dir
  }
  setFormatDefaults({ locale: formatLocaleFor(lng) })
}

const savedLang = typeof localStorage !== 'undefined' ? localStorage.getItem('asas_lang') : null
const initialLang = savedLang === 'ar' ? 'ar' : 'en'

// Immediately set document direction and format locale
applyLanguageDirection(initialLang)

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  })

export async function changeLanguage(lng) {
  const targetLang = lng === 'ar' ? 'ar' : 'en'
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('asas_lang', targetLang)
  }
  applyLanguageDirection(targetLang)
  await i18n.changeLanguage(targetLang)
}

export default i18n
