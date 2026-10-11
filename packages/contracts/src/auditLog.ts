import { z } from 'zod'
import { idSchema, isoDateTimeSchema } from './primitives/ids.js'
import { paginationMetaSchema } from './primitives/pagination.js'

export const auditLogItemSchema = z.object({
  id: idSchema,
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  actorName: z.string().nullable().optional(),
  actor: z
    .object({
      id: idSchema,
      name: z.string().nullable(),
      email: z.string(),
    })
    .nullable(),
})

export type AuditLogItem = z.infer<typeof auditLogItemSchema>

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
})

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>

export const auditLogListResponseSchema = z.object({
  items: z.array(auditLogItemSchema),
  pagination: paginationMetaSchema,
})

export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>

