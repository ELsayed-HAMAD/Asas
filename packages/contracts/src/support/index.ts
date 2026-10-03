import { z } from 'zod'
import { supportTicketStatusSchema } from '../enums.generated.js'
import { idSchema, isoDateTimeSchema, shortTextSchema } from '../primitives/ids.js'

export const supportTicketSchema = z.object({
  id: idSchema,
  subject: shortTextSchema,
  channel: z.string().nullable(),
  status: supportTicketStatusSchema,
  createdAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable(),
})
export const supportTicketListResponseSchema = z.object({ items: z.array(supportTicketSchema) })
export const supportTicketWriteSchema = z.object({ subject: shortTextSchema, channel: shortTextSchema.optional().nullable() })
export const supportTicketUpdateSchema = z.object({ status: supportTicketStatusSchema }).strict()
export type SupportTicket = z.infer<typeof supportTicketSchema>
export type SupportTicketWriteInput = z.infer<typeof supportTicketWriteSchema>
export type SupportTicketUpdateInput = z.infer<typeof supportTicketUpdateSchema>