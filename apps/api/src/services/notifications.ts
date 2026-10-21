import type { PrismaClient } from '@prisma/client'

export interface NotificationDispatchOptions {
  tenantId: string
  module: string
  eventType: string
  channel: 'email' | 'inApp' | 'slack'
  urgent?: boolean
}

export interface QuietHoursWindow {
  start: string
  end: string
}

/**
 * Checks whether a given timestamp falls within the tenant's quiet hours window.
 * Supports windows within the same calendar day (e.g., 13:00 - 15:00)
 * and windows that cross midnight (e.g., 22:00 - 07:00).
 */
export function isWithinQuietHours(start: string, end: string, now = new Date()): boolean {
  const [startHour = 22, startMin = 0] = start.split(':').map(Number)
  const [endHour = 7, endMin = 0] = end.split(':').map(Number)

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startHour * 60 + startMin
  const endMinutes = endHour * 60 + endMin

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  } else {
    // Crosses midnight, e.g. 22:00 to 07:00
    return currentMinutes >= startMinutes || currentMinutes < endMinutes
  }
}

/**
 * Calculates remaining seconds until quiet hours expire.
 */
export function calculateSecondsUntilQuietHoursEnd(start: string, end: string, now = new Date()): number {
  if (!isWithinQuietHours(start, end, now)) return 0
  const [endHour = 7, endMin = 0] = end.split(':').map(Number)
  const target = new Date(now)
  target.setHours(endHour, endMin, 0, 0)
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000))
}

/**
 * Decides whether a notification should be immediately delivered, deferred due to quiet hours,
 * or dropped entirely according to tenant notification preferences.
 */
export async function shouldDeliverNotification(
  prisma: Pick<PrismaClient, 'notificationPreference' | 'quietHours'>,
  options: NotificationDispatchOptions,
  now = new Date(),
): Promise<{ deliver: boolean; delaySeconds: number; reason?: string }> {
  const { tenantId, module, eventType, channel, urgent } = options

  // 1. Check explicit notification preference
  if (typeof (prisma as any).notificationPreference?.findUnique === 'function') {
    const pref = await (prisma as any).notificationPreference.findUnique({
      where: { tenantId_module_eventType: { tenantId, module, eventType } },
    })

    if (pref) {
      if (channel === 'email' && !pref.email) {
        return { deliver: false, delaySeconds: 0, reason: 'Disabled by tenant notification preference' }
      }
      if (channel === 'inApp' && !pref.inApp) {
        return { deliver: false, delaySeconds: 0, reason: 'Disabled by tenant notification preference' }
      }
      if (channel === 'slack' && !pref.slack) {
        return { deliver: false, delaySeconds: 0, reason: 'Disabled by tenant notification preference' }
      }
    }
  }

  // 2. Urgent notifications (e.g. security alerts, 2FA, password reset) bypass quiet hours
  if (urgent) {
    return { deliver: true, delaySeconds: 0 }
  }

  // 3. Check quiet hours for non-urgent notifications
  if (typeof (prisma as any).quietHours?.findUnique === 'function') {
    const quietHours = await (prisma as any).quietHours.findUnique({
      where: { tenantId },
    })

    if (quietHours && isWithinQuietHours(quietHours.start, quietHours.end, now)) {
      const delay = calculateSecondsUntilQuietHoursEnd(quietHours.start, quietHours.end, now)
      return { deliver: true, delaySeconds: delay, reason: 'Deferred due to tenant quiet hours' }
    }
  }

  return { deliver: true, delaySeconds: 0 }
}

