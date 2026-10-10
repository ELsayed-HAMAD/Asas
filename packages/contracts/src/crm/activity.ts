import { z } from 'zod'
import { dealActivityTypeSchema } from '../enums.generated.js'
import { boundedText, idSchema, isoDateTimeSchema } from '../primitives/ids.js'
import { paginationQuerySchema, paginated } from '../primitives/pagination.js'

export const dealActivitySchema = z.object({
  id: idSchema,
  dealId: idSchema,
  type: dealActivityTypeSchema,
  title: boundedText(160),
  body: boundedText(5000, 0).nullable(),
  actorId: z.string().min(1).max(200).nullable(),
  actorName: z.string().nullable(),
  createdAt: isoDateTimeSchema,
})

export const dealActivityListQuerySchema = paginationQuerySchema
export const dealActivityListResponseSchema = paginated(dealActivitySchema, z.null())

export const dealActivityWriteSchema = z.object({
  type: dealActivityTypeSchema,
  title: boundedText(160),
  body: boundedText(5000, 0).optional().nullable(),
})

export type DealActivity = z.infer<typeof dealActivitySchema>
export type DealActivityListQuery = z.infer<typeof dealActivityListQuerySchema>
export type DealActivityWriteInput = z.infer<typeof dealActivityWriteSchema>
