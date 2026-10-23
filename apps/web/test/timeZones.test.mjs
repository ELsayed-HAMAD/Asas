import test from 'node:test'
import assert from 'node:assert/strict'
import { getAvailableTimeZones } from '../src/lib/timeZones.js'

test('legacy browser fallback still offers the worldwide IANA timezone set', () => {
  const zones = getAvailableTimeZones(null)

  assert.ok(zones.length > 400, `expected a full timezone set, got ${zones.length}`)
  assert.ok(zones.includes('UTC'))
  assert.ok(zones.includes('Africa/Cairo'))
  assert.ok(zones.includes('America/Buenos_Aires'))
  assert.ok(zones.includes('Asia/Katmandu'))
  assert.ok(zones.includes('Pacific/Auckland'))
})

test('runtime timezone data is used while retaining a current saved timezone alias', () => {
  const zones = getAvailableTimeZones(() => ['America/New_York'], ['US/Eastern'])

  assert.deepEqual(zones, ['America/New_York', 'US/Eastern', 'UTC'])
})
