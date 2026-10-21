import { z } from 'zod'

export const inAppNotificationSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  userId: z.string().nullable(),
  title: z.string(),
  message: z.string(),
  type: z.enum(['INFO', 'SUCCESS', 'WARNING', 'DANGER']),
  link: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
})

export type InAppNotification = z.infer<typeof inAppNotificationSchema>

export const notificationsListResponseSchema = z.object({
  items: z.array(inAppNotificationSchema),
  unreadCount: z.number().int().nonnegative(),
})

export type NotificationsListResponse = z.infer<typeof notificationsListResponseSchema>

export const notificationMarkReadSchema = z.object({
  read: z.boolean().default(true),
})

export type NotificationMarkReadInput = z.infer<typeof notificationMarkReadSchema>

