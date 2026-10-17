import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCompactMoney } from '../src/lib/crmMoney.js';

test('formatCompactMoney formats values >= 1M with max 2 decimals, trailing zeros trimmed, and M suffix', () => {
  assert.equal(formatCompactMoney(1353728), '$1.35M');
  assert.equal(formatCompactMoney(2367713), '$2.37M');
  assert.equal(formatCompactMoney(4782157), '$4.78M');
  assert.equal(formatCompactMoney(1000000), '$1M');
  assert.equal(formatCompactMoney(1500000), '$1.5M');
  assert.equal(formatCompactMoney(1230000), '$1.23M');
  assert.equal(formatCompactMoney({ amount: 135372800, currency: 'USD' }), '$1.35M');
});

test('formatCompactMoney formats values 1K to 999K with 0 decimals, rounded to nearest thousand, and K suffix', () => {
  assert.equal(formatCompactMoney(546638), '$547K');
  assert.equal(formatCompactMoney(771670), '$772K');
  assert.equal(formatCompactMoney(1000), '$1K');
  assert.equal(formatCompactMoney(1499), '$1K');
  assert.equal(formatCompactMoney(1500), '$2K');
  assert.equal(formatCompactMoney({ amount: 54663800, currency: 'USD' }), '$547K');
});

test('formatCompactMoney formats values below 1K as full integer numbers', () => {
  assert.equal(formatCompactMoney(0), '$0');
  assert.equal(formatCompactMoney(450), '$450');
  assert.equal(formatCompactMoney(999), '$999');
  assert.equal(formatCompactMoney(null), '$0');
  assert.equal(formatCompactMoney(undefined), '$0');
});

