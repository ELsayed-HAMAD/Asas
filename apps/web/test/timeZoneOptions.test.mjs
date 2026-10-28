import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTimeZoneOptions, timeZoneCityLabel } from '../src/lib/timeZoneOptions.js'

test('timezone options lead with suggested zones and expose region, offset, and local time', () => {
  const now = new Date('2026-01-15T12:00:00.000Z')
  const zones = ['Africa/Cairo', 'America/New_York', 'Asia/Tokyo', 'UTC']
  const options = buildTimeZoneOptions(now, zones, 'Europe/London')

  assert.deepEqual(
    options.filter(option => option.group === 'Suggested').map(option => option.value),
    ['UTC']
  )
  assert.equal(new Set(options.map(option => option.value)).size, options.length)

  const cairo = options.find(option => option.value === 'Africa/Cairo')
  assert.equal(cairo.label, 'Cairo')
  assert.equal(cairo.description, 'Africa/Cairo')
  assert.equal(cairo.group, 'Africa')
  assert.match(cairo.meta, /^GMT\+02:00 · \d{2}:\d{2}$/)
  assert.match(cairo.keywords, /Africa\/Cairo/)

  const newYork = options.find(option => option.value === 'America/New_York')
  assert.equal(newYork.group, 'Americas')
  assert.match(newYork.meta, /^GMT-05:00 · \d{2}:\d{2}$/)

  assert.deepEqual(
    [...new Set(options.map(option => option.group))],
    ['Suggested', 'Africa', 'Americas', 'Asia']
  )
})

test('saved timezone labels drop the IANA region prefix', () => {
  assert.equal(timeZoneCityLabel('Africa/Cairo'), 'Cairo')
  assert.equal(timeZoneCityLabel('America/Argentina/Buenos_Aires'), 'Argentina / Buenos Aires')
  assert.equal(timeZoneCityLabel('UTC'), 'UTC')
})

test('saved timezone aliases remain selectable after loading settings', () => {
  const now = new Date('2026-01-15T12:00:00.000Z')
  const options = buildTimeZoneOptions(now, ['US/Eastern', 'UTC'], 'UTC')
  const alias = options.find(option => option.value === 'US/Eastern')

  assert.ok(alias)
  assert.equal(alias.label, 'Eastern')
  assert.match(alias.keywords, /US\/Eastern/)
})
