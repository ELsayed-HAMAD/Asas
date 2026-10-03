import { z } from 'zod'
import { idSchema, isoDateTimeSchema, shortTextSchema } from '../primitives/ids.js'

export const agendaItemSchema = z.object({
  id: idSchema,
  title: shortTextSchema,
  timeLabel: z.string().nullable(),
  priority: z.string().nullable(),
  done: z.boolean(),
  createdAt: isoDateTimeSchema,
})

export const agendaListResponseSchema = z.object({ items: z.array(agendaItemSchema) })
export const agendaItemWriteSchema = z.object({
  title: shortTextSchema,
  timeLabel: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  done: z.boolean().optional(),
})
export const agendaItemUpdateSchema = agendaItemWriteSchema.partial().refine(value => Object.keys(value).length > 0)

export type AgendaItem = z.infer<typeof agendaItemSchema>
export type AgendaItemWriteInput = z.infer<typeof agendaItemWriteSchema>
export type AgendaItemUpdateInput = z.infer<typeof agendaItemUpdateSchema>