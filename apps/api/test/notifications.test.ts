import { describe, expect, it } from 'vitest'
import {
  calculateSecondsUntilQuietHoursEnd,
  isWithinQuietHours,
  shouldDeliverNotification,
} from '../src/services/notifications.js'

describe('Finding 6: Notification Preferences & Quiet Hours', () => {
  it('correctly evaluates quiet hours that cross midnight (22:00 to 07:00)', () => {
    // 23:30 is in quiet hours
    const lateNight = new Date('2026-10-21T23:30:00')
    expect(isWithinQuietHours('22:00', '07:00', lateNight)).toBe(true)

    // 04:15 is in quiet hours
    const earlyMorning = new Date('2026-10-21T04:15:00')
    expect(isWithinQuietHours('22:00', '07:00', earlyMorning)).toBe(true)

    // 14:00 is outside quiet hours
    const afternoon = new Date('2026-10-21T14:00:00')
    expect(isWithinQuietHours('22:00', '07:00', afternoon)).toBe(false)
  })

  it('correctly evaluates same-day quiet hours (13:00 to 15:00)', () => {
    const during = new Date('2026-10-21T14:00:00')
    expect(isWithinQuietHours('13:00', '15:00', during)).toBe(true)

    const before = new Date('2026-10-21T11:00:00')
    expect(isWithinQuietHours('13:00', '15:00', before)).toBe(false)

    const after = new Date('2026-10-21T16:00:00')
    expect(isWithinQuietHours('13:00', '15:00', after)).toBe(false)
  })

  it('calculates remaining seconds until quiet hours end', () => {
    const now = new Date('2026-10-21T06:00:00')
    const remainingSeconds = calculateSecondsUntilQuietHoursEnd('22:00', '07:00', now)
    // 1 hour = 3600 seconds
    expect(remainingSeconds).toBe(3600)
  })

  it('drops notification when channel is disabled by tenant preference', async () => {
    const prisma = {
      notificationPreference: {
        findUnique: async () => ({
          tenantId: 'tenant_1',
          module: 'finance',
          eventType: 'invoice.created',
          email: false,
          inApp: true,
          slack: false,
        }),
      },
      quietHours: {
        findUnique: async () => null,
      },
    } as any

    const result = await shouldDeliverNotification(prisma, {
      tenantId: 'tenant_1',
      module: 'finance',
      eventType: 'invoice.created',
      channel: 'email',
    })

    expect(result.deliver).toBe(false)
    expect(result.reason).toContain('Disabled by tenant notification preference')
  })

  it('defers non-urgent notification during quiet hours', async () => {
    const prisma = {
      notificationPreference: {
        findUnique: async () => null,
      },
      quietHours: {
        findUnique: async () => ({
          tenantId: 'tenant_1',
          start: '22:00',
          end: '07:00',
        }),
      },
    } as any

    const now = new Date('2026-10-21T23:00:00')
    const result = await shouldDeliverNotification(prisma, {
      tenantId: 'tenant_1',
      module: 'hr',
      eventType: 'timesheet.submitted',
      channel: 'email',
      urgent: false,
    }, now)

    expect(result.deliver).toBe(true)
    expect(result.delaySeconds).toBeGreaterThan(0)
    expect(result.reason).toContain('Deferred due to tenant quiet hours')
  })

  it('delivers urgent notification immediately even during quiet hours', async () => {
    const prisma = {
      notificationPreference: {
        findUnique: async () => null,
      },
      quietHours: {
        findUnique: async () => ({
          tenantId: 'tenant_1',
          start: '22:00',
          end: '07:00',
        }),
      },
    } as any

    const now = new Date('2026-10-21T23:00:00')
    const result = await shouldDeliverNotification(prisma, {
      tenantId: 'tenant_1',
      module: 'auth',
      eventType: 'password.reset',
      channel: 'email',
      urgent: true,
    }, now)

    expect(result.deliver).toBe(true)
    expect(result.delaySeconds).toBe(0)
  })
})

