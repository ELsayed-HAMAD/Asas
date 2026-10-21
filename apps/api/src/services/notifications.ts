import type { PrismaClient } from '@prisma/client'

export interface NotificationDispatchOptions {
  tenantId: string
  module: string
  eventType: string
  channel: 'email' | 'inApp' | 'slack'
  urgent?: boolean | undefined
}

export interface QuietHoursWindow {
  start: string
  end: string
}

type NotificationPrisma = Pick<PrismaClient, 'notification' | 'notificationPreference' | 'quietHours' | 'tenant' | 'member'>

function localMinutes(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0)
    const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0)
    return hour * 60 + minute
  } catch {
    // A malformed legacy timezone should not make notification creation fail.
    return now.getUTCHours() * 60 + now.getUTCMinutes()
  }
}

/**
 * Checks whether a given timestamp falls within the tenant's quiet hours window.
 * Supports windows within the same calendar day (e.g., 13:00 - 15:00)
 * and windows that cross midnight (e.g., 22:00 - 07:00).
 */
export function isWithinQuietHours(start: string, end: string, now = new Date(), timeZone = 'UTC'): boolean {
  const [startHour = 22, startMin = 0] = start.split(':').map(Number)
  const [endHour = 7, endMin = 0] = end.split(':').map(Number)

  const currentMinutes = localMinutes(now, timeZone)
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
export function calculateSecondsUntilQuietHoursEnd(start: string, end: string, now = new Date(), timeZone = 'UTC'): number {
  if (!isWithinQuietHours(start, end, now, timeZone)) return 0
  const nowMs = now.getTime()
  const firstMinute = 60_000 - (nowMs % 60_000)
  // Walk real instants, not host-local wall time. This keeps tenant timezones and DST changes
  // correct and returns the first instant at which the configured quiet window has ended.
  for (let elapsedMs = firstMinute; elapsedMs <= 26 * 60 * 60 * 1000; elapsedMs += 60_000) {
    if (!isWithinQuietHours(start, end, new Date(nowMs + elapsedMs), timeZone)) {
      return Math.ceil(elapsedMs / 1000)
    }
  }
  return 0
}

/**
 * Decides whether a notification should be immediately delivered, deferred due to quiet hours,
 * or dropped entirely according to tenant notification preferences.
 */
export async function shouldDeliverNotification(
  prisma: Pick<PrismaClient, 'notificationPreference' | 'quietHours' | 'tenant'>,
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

  if (channel !== 'inApp') {
    return { deliver: false, delaySeconds: 0, reason: `The ${channel} notification provider is not configured` }
  }

  // 2. Urgent notifications (e.g. security alerts, 2FA, password reset) bypass quiet hours
  if (urgent) {
    return { deliver: true, delaySeconds: 0 }
  }

  // 3. Check quiet hours in the workspace timezone for non-urgent notifications.
  let timeZone = 'UTC'
  if (typeof (prisma as any).tenant?.findUnique === 'function') {
    const tenant = await (prisma as any).tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } })
    if (typeof tenant?.timezone === 'string' && tenant.timezone) timeZone = tenant.timezone
  }
  if (typeof (prisma as any).quietHours?.findUnique === 'function') {
    const quietHours = await (prisma as any).quietHours.findUnique({
      where: { tenantId },
    })

    if (quietHours && isWithinQuietHours(quietHours.start, quietHours.end, now, timeZone)) {
      const delay = calculateSecondsUntilQuietHoursEnd(quietHours.start, quietHours.end, now, timeZone)
      return { deliver: true, delaySeconds: delay, reason: 'Deferred due to tenant quiet hours' }
    }
  }

  return { deliver: true, delaySeconds: 0 }
}

export interface InAppNotificationCreateInput {
  tenantId: string
  userId: string
  title: string
  message: string
  type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER'
  link?: string | null
  module?: string
  eventType?: string
  urgent?: boolean
}

export async function createInAppNotification(
  prisma: NotificationPrisma,
  input: InAppNotificationCreateInput,
  ssePublish?: (tenantId: string, topics: string[]) => void,
) {
  const { tenantId, userId, title, message, type = 'INFO', link, module, eventType, urgent } = input
  let availableAt = new Date()

  if (module && eventType) {
    const decision = await shouldDeliverNotification(prisma, {
      tenantId,
      module,
      eventType,
      channel: 'inApp',
      urgent,
    })
    if (!decision.deliver) return null
    if (decision.delaySeconds > 0) availableAt = new Date(Date.now() + decision.delaySeconds * 1000)
  }

  const notification = await prisma.notification.create({
    data: {
      tenantId,
      userId,
      title,
      message,
      type,
      link: link || null,
      availableAt,
    },
  })

  if (ssePublish) {
    ssePublish(tenantId, ['asas,notifications'])
  }

  return {
    id: notification.id,
    tenantId: notification.tenantId,
    userId: notification.userId,
    title: notification.title,
    message: notification.message,
    type: notification.type as 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER',
    link: notification.link,
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
  }
}

export async function notifyWorkspaceRoles(
  prisma: NotificationPrisma,
  input: Omit<InAppNotificationCreateInput, 'userId'> & { roles: Array<'OWNER' | 'ADMIN' | 'MEMBER'>; excludeUserId?: string },
  ssePublish?: (tenantId: string, topics: string[]) => void,
): Promise<number> {
  const { roles, excludeUserId, ...notification } = input
  const members = await prisma.member.findMany({
    where: {
      tenantId: input.tenantId,
      role: { in: roles },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: { userId: true },
  })
  const userIds = [...new Set(members.map(member => member.userId).filter((id): id is string => Boolean(id)))]
  const results = await Promise.all(userIds.map(userId => createInAppNotification(
    prisma,
    { ...notification, userId },
    ssePublish,
  )))
  return results.filter(Boolean).length
}

export async function listUserNotifications(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  limit = 40,
) {
  const where = {
    tenantId,
    availableAt: { lte: new Date() },
    userId,
  }

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({
      where: {
        ...where,
        read: false,
      },
    }),
  ])

  return {
    items: items.map(n => ({
      id: n.id,
      tenantId: n.tenantId,
      userId: n.userId,
      title: n.title,
      message: n.message,
      type: n.type as 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER',
      link: n.link,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  }
}

export async function markNotificationRead(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  notificationId: string,
  read = true,
) {
  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      tenantId,
      userId,
    },
    data: { read },
  })
}

export async function markAllNotificationsRead(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
) {
  await prisma.notification.updateMany({
    where: {
      tenantId,
      userId,
      read: false,
    },
    data: { read: true },
  })
}

export async function deleteNotification(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  notificationId: string,
) {
  await prisma.notification.deleteMany({
    where: {
      id: notificationId,
      tenantId,
      userId,
    },
  })
}

