import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listCurrencies } from '@asas/domain/money';
import { formatMoney, formatCompactMoney, formatDate, getFormatDefaults, moneyToMajor, setFormatDefaults } from '../src/lib/format.js';

test('every currency uses the same minor-unit exponent as the backend', () => {
  for (const currency of listCurrencies()) {
    assert.equal(moneyToMajor({ amount: 123456, currency: currency.code }), 123456 / 10 ** currency.minorUnitDigits, currency.code);
  }
});

test('formats zero-, two- and three-digit currencies without changing their value', () => {
  assert.equal(formatMoney({ amount: 123456, currency: 'USD' }), '$1,234.56');
  assert.equal(formatMoney({ amount: 123456, currency: 'JPY' }), '¥123,456');
  assert.equal(formatMoney({ amount: 123456, currency: 'KWD' }), new Intl.NumberFormat('en-US', { style: 'currency', currency: 'KWD', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(123.456));
});

test('IQD wire scale is three digits even when Intl currency defaults differ', () => {
  const wire = { amount: 1234, currency: 'IQD' };
  assert.equal(moneyToMajor(wire), 1.234);
  assert.equal(formatMoney(wire), new Intl.NumberFormat('en-US', { style: 'currency', currency: 'IQD', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(1.234));
});

test('preserves major-unit salary strings and caller display options', () => {
  setFormatDefaults({ currency: 'USD', locale: 'en-US' });
  assert.equal(formatMoney('1250.00'), '$1,250.00');
  assert.equal(formatMoney('1250', { minimumFractionDigits: 0 }), '$1,250');
  assert.equal(formatMoney('1250', { maximumFractionDigits: 0 }), '$1,250');
  assert.equal(formatMoney('1250', { forcePlus: true }), '+$1,250.00');
});

test('compact formatting understands money wire objects rather than returning fake or missing values', () => {
  assert.equal(formatCompactMoney({ amount: 125000, currency: 'USD' }), '$1.3K');
  assert.equal(formatMoney({ amount: 125000, currency: 'USD' }, { compact: true }), '$1.3K');
});

test('wire currency takes precedence over the workspace display default', () => {
  setFormatDefaults({ currency: 'JPY' });
  try {
    assert.equal(formatMoney({ amount: 1234, currency: 'USD' }), '$12.34');
  } finally { setFormatDefaults({ currency: 'USD' }); }
});

test('does not guess currency scales or display nonfinite/unsafe amounts', () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity, { amount: 1, currency: 'ZZZ' }, { amount: 1.5, currency: 'USD' }, { amount: Number.MAX_SAFE_INTEGER + 1, currency: 'USD' }]) {
    assert.equal(formatMoney(value), '—');
    assert.equal(formatCompactMoney(value), '—');
  }
  assert.ok(Number.isNaN(moneyToMajor({ amount: 1, currency: 'ZZZ' })));
});

test('uses workspace date format and timezone while preserving calendar-only dates', () => {
  setFormatDefaults({ timezone: 'America/Los_Angeles', dateFormat: 'yyyy-MM-dd' });
  try {
    assert.equal(formatDate('2026-01-01T02:00:00.000Z'), '2025-12-31');
    assert.equal(formatDate('2026-01-01'), '2026-01-01');
    assert.equal(formatDate('2026-02-31'), '—');
    assert.equal(getFormatDefaults().timeZone, 'America/Los_Angeles');
  } finally {
    setFormatDefaults({ timezone: 'UTC', dateFormat: 'MMM d, yyyy' });
  }
});

test('caller date options and timezone override workspace date defaults', () => {
  setFormatDefaults({ timezone: 'UTC' });
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  const expected = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'Asia/Tokyo' }).format(new Date('2026-01-01T16:00:00.000Z'));
  assert.equal(formatDate('2026-01-01T16:00:00.000Z', { ...options, timeZone: 'Asia/Tokyo' }), expected);
});
