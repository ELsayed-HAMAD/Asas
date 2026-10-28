import { getAvailableTimeZones } from './timeZones.js'

const REGION_LABELS = {
  Africa: 'Africa',
  America: 'Americas',
  Antarctica: 'Antarctica',
  Arctic: 'Arctic',
  Asia: 'Asia',
  Atlantic: 'Atlantic',
  Australia: 'Australia',
  Europe: 'Europe',
  Indian: 'Indian Ocean',
  Pacific: 'Pacific',
  Etc: 'Other',
}

const SPECIAL_ZONE_DESCRIPTIONS = {
  UTC: 'Coordinated Universal Time',
}

function plainLabel(value) {
  return value.replaceAll('_', ' ')
}

function shortOffset(zone, now) {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(now).find(part => part.type === 'timeZoneName')?.value
    return normalizeOffset(formatted)
  } catch {
    return 'GMT+00:00'
  }
}

function normalizeOffset(value) {
  if (!value || value === 'GMT' || value === 'UTC') return 'GMT+00:00'
  const match = value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/)
  if (!match) return value
  const [, sign, hours, minutes = '00'] = match
  return `GMT${sign}${hours.padStart(2, '0')}:${minutes}`
}

function localTime(zone, now) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now)
  } catch {
    return ''
  }
}

function zoneName(zone, now) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(now).find(part => part.type === 'timeZoneName')?.value || ''
  } catch {
    return ''
  }
}

function cityLabel(zone) {
  if (SPECIAL_ZONE_DESCRIPTIONS[zone]) return zone
  const [, ...cityParts] = zone.split('/')
  return plainLabel(cityParts.join(' / ') || zone)
}

function regionLabel(zone) {
  return REGION_LABELS[zone.split('/')[0]] || plainLabel(zone.split('/')[0])
}

/** Human label for a saved IANA zone, e.g. `America/New_York` becomes `New York`. */
export function timeZoneCityLabel(zone) {
  return cityLabel(zone)
}

function buildOption(zone, now, group) {
  const offset = shortOffset(zone, now)
  const time = localTime(zone, now)
  const abbreviation = zoneName(zone, now)
  const utcOffset = `UTC${offset.slice(3)}`
  return {
    value: zone,
    label: cityLabel(zone),
    description: SPECIAL_ZONE_DESCRIPTIONS[zone] || zone,
    meta: time ? `${offset} · ${time}` : offset,
    group,
    keywords: `${zone} ${cityLabel(zone)} ${regionLabel(zone)} ${offset} ${offset.replace(':00', '')} ${utcOffset} ${time} ${abbreviation}`,
  }
}

/**
 * Builds searchable timezone choices grouped by region. The browser's own zone and UTC
 * appear first so the common choice does not require scrolling through hundreds of rows.
 */
export function buildTimeZoneOptions(
  now = new Date(),
  zones = getAvailableTimeZones(undefined, [Intl.DateTimeFormat().resolvedOptions().timeZone]),
  browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
) {
  const suggested = [...new Set([browserZone, 'UTC'].filter(zone => zone && zones.includes(zone)))]
  const remaining = zones.filter(zone => !suggested.includes(zone))

  const suggestedOptions = suggested.map(zone => buildOption(zone, now, 'Suggested'))

  const regionalOptions = remaining
    .map(zone => buildOption(zone, now, regionLabel(zone)))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label))

  return [...suggestedOptions, ...regionalOptions]
}
