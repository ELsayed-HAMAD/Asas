import { z } from 'zod'
import { idSchema, isoDateTimeSchema, shortTextSchema } from '../primitives/ids.js'
import { collection } from '../primitives/pagination.js'

export const departmentSchema = z.object({
  id: idSchema,
  name: z.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Department = z.infer<typeof departmentSchema>

export const departmentListResponseSchema = collection(departmentSchema)

export const departmentWriteSchema = z.object({
  name: shortTextSchema,
})

export type DepartmentWriteInput = z.infer<typeof departmentWriteSchema>
