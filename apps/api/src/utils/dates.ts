import { AppError } from './errors.js'

/** Return the tenant-local calendar date represented as UTC midnight. */
export function tenantToday(timezone: string, instant: Date = new Date()): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
    const year = Number(part('year'))
    const month = Number(part('month'))
    const day = Number(part('day'))
    if (!year || !month || !day) throw new Error('Invalid date parts')
    return new Date(Date.UTC(year, month - 1, day))
  } catch {
    throw new AppError(409, 'Workspace timezone is invalid; update it in settings before calculating business dates')
  }
}

/** Current month-to-date and same elapsed calendar dates in the previous month. */
export function monthToDateComparisonPeriods(today: Date) {
  const currentStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const currentEnd = new Date(today)
  currentEnd.setUTCDate(currentEnd.getUTCDate() + 1)
  const previousStart = new Date(currentStart)
  previousStart.setUTCMonth(previousStart.getUTCMonth() - 1)
  const previousMonthLength = new Date(Date.UTC(previousStart.getUTCFullYear(), previousStart.getUTCMonth() + 1, 0)).getUTCDate()
  const previousEnd = new Date(previousStart)
  previousEnd.setUTCDate(Math.min(today.getUTCDate(), previousMonthLength) + 1)
  const dateKey = (date: Date) => date.toISOString().slice(0, 10)
  return {
    current: { startDate: dateKey(currentStart), endDateExclusive: dateKey(currentEnd) },
    previous: { startDate: dateKey(previousStart), endDateExclusive: dateKey(previousEnd) },
  }
}
