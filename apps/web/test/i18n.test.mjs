import assert from 'node:assert/strict'
import { test } from 'node:test'
import i18n, { SUPPORTED_LANGUAGES, changeLanguage, applyLanguageDirection } from '../src/lib/i18n.js'
import { getFormatDefaults } from '../src/lib/format.js'
import en from '../src/locales/en.json' with { type: 'json' }
import ar from '../src/locales/ar.json' with { type: 'json' }

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const REQUIRED_ARABIC_PLURAL_FORMS = ['one', 'two', 'few', 'many', 'other']

function flatten(value, prefix = '') {
  const flat = {}
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      Object.assign(flat, flatten(entry, path))
    } else {
      flat[path] = entry
    }
  }
  return flat
}

function baseKey(key) {
  return key.replace(PLURAL_SUFFIX, '')
}

test('defines supported languages with correct directions', () => {
  const codes = SUPPORTED_LANGUAGES.map(l => l.code)
  assert.ok(codes.includes('en'))
  assert.ok(codes.includes('ar'))

  const ar = SUPPORTED_LANGUAGES.find(l => l.code === 'ar')
  assert.equal(ar.dir, 'rtl')

  const en = SUPPORTED_LANGUAGES.find(l => l.code === 'en')
  assert.equal(en.dir, 'ltr')
})

test('English and Arabic catalogs expose the same message keys', () => {
  const enKeys = new Set(Object.keys(flatten(en)).map(baseKey))
  const arKeys = new Set(Object.keys(flatten(ar)).map(baseKey))

  const missingInArabic = [...enKeys].filter(key => !arKeys.has(key))
  const missingInEnglish = [...arKeys].filter(key => !enKeys.has(key))

  assert.deepEqual(missingInArabic, [], 'Arabic catalog is missing keys')
  assert.deepEqual(missingInEnglish, [], 'English catalog is missing keys')
})

test('Arabic plural messages define every Arabic plural category', () => {
  const groups = new Map()
  for (const key of Object.keys(flatten(ar))) {
    const match = key.match(PLURAL_SUFFIX)
    if (!match) continue
    const base = baseKey(key)
    groups.set(base, [...(groups.get(base) || []), match[1]])
  }

  for (const [base, forms] of groups) {
    for (const form of REQUIRED_ARABIC_PLURAL_FORMS) {
      assert.ok(forms.includes(form), `${base} must define the _${form} form`)
    }
  }
})

test('English plural messages define the one and other forms', () => {
  const groups = new Map()
  for (const key of Object.keys(flatten(en))) {
    const match = key.match(PLURAL_SUFFIX)
    if (!match) continue
    const base = baseKey(key)
    groups.set(base, [...(groups.get(base) || []), match[1]])
  }

  for (const [base, forms] of groups) {
    assert.ok(forms.includes('one'), `${base} must define a _one form`)
    assert.ok(forms.includes('other'), `${base} must define an _other form`)
  }
})

test('no catalog message is empty', () => {
  for (const [locale, catalog] of [['en', en], ['ar', ar]]) {
    for (const [key, value] of Object.entries(flatten(catalog))) {
      assert.equal(typeof value, 'string', `${locale}:${key} must be a string`)
      assert.ok(value.trim().length > 0, `${locale}:${key} must not be empty`)
    }
  }
})

test('translates navigation keys in English and Arabic', async () => {
  await changeLanguage('en')
  assert.equal(i18n.t('nav.dashboard'), 'Dashboard')
  assert.equal(i18n.t('nav.payroll'), 'Payroll')
  assert.equal(i18n.t('nav.accountsPayable'), 'Accounts Payable')
  assert.equal(i18n.t('common.newEntry'), 'New Entry')
  assert.equal(i18n.t('shell.switchWorkspace'), 'Switch or View All Workspaces')
  assert.equal(i18n.t('commandPalette.items.nav-payroll.title'), 'Payroll Runs')

  await changeLanguage('ar')
  assert.equal(i18n.t('nav.dashboard'), 'لوحة التحكم')
  assert.equal(i18n.t('nav.payroll'), 'مسيرات الرواتب')
  assert.equal(i18n.t('nav.accountsPayable'), 'حسابات الموردين (AP)')
  assert.equal(i18n.t('common.newEntry'), 'إدخال جديد')
  assert.equal(i18n.t('shell.switchWorkspace'), 'تبديل مساحة العمل أو عرض الكل')
  assert.equal(i18n.t('commandPalette.items.nav-payroll.title'), 'مسيرات الرواتب')
  assert.equal(i18n.t('notifications.title'), 'الإشعارات')

  // Restore English
  await changeLanguage('en')
  assert.equal(i18n.t('nav.dashboard'), 'Dashboard')
})

test('synchronizes format locale on direction change', () => {
  applyLanguageDirection('ar')
  assert.equal(getFormatDefaults().locale, 'ar-EG-u-nu-latn')

  applyLanguageDirection('en')
  assert.equal(getFormatDefaults().locale, 'en-US')
})
