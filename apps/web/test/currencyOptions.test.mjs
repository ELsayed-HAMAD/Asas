import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCurrencyOptions } from '../src/lib/currencyOptions.js'

test('currency options put common currencies first and expose searchable metadata', () => {
  const options = buildCurrencyOptions()
  const values = options.map(option => option.value)

  assert.equal(new Set(values).size, values.length)
  assert.equal(options[0].value, 'USD')
  assert.ok(options[0].group === 'Common currencies')

  const firstOther = options.findIndex(option => option.group === 'All currencies')
  assert.ok(firstOther > 0)
  assert.ok(options.slice(0, firstOther).every(option => option.group === 'Common currencies'))
  assert.ok(options.slice(firstOther).every(option => option.group === 'All currencies'))

  const egyptianPound = options.find(option => option.value === 'EGP')
  assert.equal(egyptianPound.label, 'EGP')
  assert.ok(egyptianPound.description.length > 3)
  assert.ok(egyptianPound.meta.length > 0)
  assert.match(egyptianPound.keywords, /EGP/)
})
