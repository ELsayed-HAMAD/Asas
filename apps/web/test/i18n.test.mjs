import assert from 'node:assert/strict'
import { test } from 'node:test'
import i18n, { SUPPORTED_LANGUAGES, changeLanguage, applyLanguageDirection } from '../src/lib/i18n.js'
import { getFormatDefaults } from '../src/lib/format.js'

test('defines supported languages with correct directions', () => {
  const codes = SUPPORTED_LANGUAGES.map(l => l.code)
  assert.ok(codes.includes('en'))
  assert.ok(codes.includes('ar'))

  const ar = SUPPORTED_LANGUAGES.find(l => l.code === 'ar')
  assert.equal(ar.dir, 'rtl')

  const en = SUPPORTED_LANGUAGES.find(l => l.code === 'en')
  assert.equal(en.dir, 'ltr')
})

test('translates navigation keys in English and Arabic', async () => {
  await changeLanguage('en')
  assert.equal(i18n.t('nav.dashboard'), 'Dashboard')
  assert.equal(i18n.t('nav.payroll'), 'Payroll')
  assert.equal(i18n.t('nav.accountsPayable'), 'Accounts Payable')
  assert.equal(i18n.t('common.newEntry'), 'New Entry')

  await changeLanguage('ar')
  assert.equal(i18n.t('nav.dashboard'), 'لوحة التحكم')
  assert.equal(i18n.t('nav.payroll'), 'مسيرات الرواتب')
  assert.equal(i18n.t('nav.accountsPayable'), 'حسابات الموردين (AP)')
  assert.equal(i18n.t('common.newEntry'), 'إدخال جديد')

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
