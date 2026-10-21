import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calculateSecondsUntilQuietHoursEnd,
  createInAppNotification,
  deleteNotification,
  isWithinQuietHours,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  shouldDeliverNotification,
} from '../src/services/notifications.js'

afterEach(() => vi.useRealTimers())

describe('Finding 6: Notification Preferences & Quiet Hours', () => {
  it('keeps notification read and delete actions scoped to the requesting user', async () => {
    const prisma = {
      notification: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as any

    await markNotificationRead(prisma, 'tenant_1', 'user_1', 'notification_1')
    await markAllNotificationsRead(prisma, 'tenant_1', 'user_1')
    await deleteNotification(prisma, 'tenant_1', 'user_1', 'notification_1')

    expect(prisma.notification.updateMany.mock.calls[0]?.[0].where).toEqual({
      id: 'notification_1', tenantId: 'tenant_1', userId: 'user_1',
    })
    expect(prisma.notification.updateMany.mock.calls[1]?.[0].where).toEqual({
      tenantId: 'tenant_1', userId: 'user_1', read: false,
    })
    expect(prisma.notification.deleteMany.mock.calls[0]?.[0].where).toEqual({
      id: 'notification_1', tenantId: 'tenant_1', userId: 'user_1',
    })
  })

  it('correctly evaluates quiet hours that cross midnight (22:00 to 07:00)', () => {
    // 23:30 is in quiet hours
    const lateNight = new Date('2026-10-21T23:30:00.000Z')
    expect(isWithinQuietHours('22:00', '07:00', lateNight, 'UTC')).toBe(true)

    // 04:15 is in quiet hours
    const earlyMorning = new Date('2026-10-21T04:15:00.000Z')
    expect(isWithinQuietHours('22:00', '07:00', earlyMorning, 'UTC')).toBe(true)

    // 14:00 is outside quiet hours
    const afternoon = new Date('2026-10-21T14:00:00.000Z')
    expect(isWithinQuietHours('22:00', '07:00', afternoon, 'UTC')).toBe(false)
  })

  it('evaluates quiet hours in the workspace timezone, independent of the API host timezone', () => {
    const now = new Date('2026-10-22T02:00:00.000Z') // 22:00 in New York before DST ends
    expect(isWithinQuietHours('22:00', '07:00', now, 'America/New_York')).toBe(true)
    expect(calculateSecondsUntilQuietHoursEnd('22:00', '07:00', now, 'America/New_York')).toBe(9 * 60 * 60)
  })

  it('correctly evaluates same-day quiet hours (13:00 to 15:00)', () => {
    const during = new Date('2026-10-21T14:00:00.000Z')
    expect(isWithinQuietHours('13:00', '15:00', during, 'UTC')).toBe(true)

    const before = new Date('2026-10-21T11:00:00.000Z')
    expect(isWithinQuietHours('13:00', '15:00', before, 'UTC')).toBe(false)

    const after = new Date('2026-10-21T16:00:00.000Z')
    expect(isWithinQuietHours('13:00', '15:00', after, 'UTC')).toBe(false)
  })

  it('calculates remaining seconds until quiet hours end', () => {
    const now = new Date('2026-10-21T06:00:00.000Z')
    const remainingSeconds = calculateSecondsUntilQuietHoursEnd('22:00', '07:00', now, 'UTC')
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

    const now = new Date('2026-10-21T23:00:00.000Z')
    const result = await shouldDeliverNotification(prisma, {
      tenantId: 'tenant_1',
      module: 'hr',
      eventType: 'timesheet.submitted',
      channel: 'inApp',
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

    const now = new Date('2026-10-21T23:00:00.000Z')
    const result = await shouldDeliverNotification(prisma, {
      tenantId: 'tenant_1',
      module: 'auth',
      eventType: 'password.reset',
      channel: 'inApp',
      urgent: true,
    }, now)

    expect(result.deliver).toBe(true)
    expect(result.delaySeconds).toBe(0)
  })

  it('does not claim unavailable email or Slack channels will deliver', async () => {
    const prisma = {
      notificationPreference: { findUnique: async () => null },
      quietHours: { findUnique: async () => null },
      tenant: { findUnique: async () => ({ timezone: 'UTC' }) },
    } as any

    const result = await shouldDeliverNotification(prisma, {
      tenantId: 'tenant_1', module: 'finance', eventType: 'invoice.created', channel: 'email',
    })
    expect(result).toMatchObject({ deliver: false, delaySeconds: 0 })
    expect(result.reason).toContain('not configured')
  })

  it('persists a durable due time for quiet-hour alerts and lists them only when due', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T23:00:00.000Z'))
    const createdAt = new Date('2026-10-21T23:00:00.000Z')
    const create = vi.fn().mockImplementation(async ({ data }) => ({ id: 'n_1', ...data, createdAt }))
    const prisma = {
      notificationPreference: { findUnique: vi.fn().mockResolvedValue({ inApp: true, email: false, slack: false }) },
      quietHours: { findUnique: vi.fn().mockResolvedValue({ start: '22:00', end: '07:00' }) },
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }) },
      notification: { create, findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    } as any

    await createInAppNotification(prisma, {
      tenantId: 'tenant_1', userId: 'user_1', title: 'New invoice', message: 'Review the invoice.',
      module: 'finance', eventType: 'invoice.created',
    })
    expect(create.mock.calls[0]?.[0].data.availableAt).toEqual(new Date('2026-10-22T07:00:00.000Z'))

    await listUserNotifications(prisma, 'tenant_1', 'user_1')
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user_1',
        availableAt: { lte: new Date('2026-10-21T23:00:00.000Z') },
      }),
    }))
  })
})

