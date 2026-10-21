import { describe, expect, it } from 'vitest'
import { inAppNotificationSchema } from './notifications.js'

describe('in-app notification contract', () => {
  it('requires an owned user because persisted notifications are user scoped', () => {
    const notification = {
      id: 'notification_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      title: 'New invoice',
      message: 'An invoice is ready for review.',
      type: 'INFO',
      link: null,
      read: false,
      createdAt: '2026-10-21T12:00:00.000Z',
    }

    expect(inAppNotificationSchema.parse(notification)).toEqual(notification)
    expect(inAppNotificationSchema.safeParse({ ...notification, userId: null }).success).toBe(false)
  })
})
