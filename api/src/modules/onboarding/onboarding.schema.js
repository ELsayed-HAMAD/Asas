import { z } from 'zod'

export const markEmptySchema = z.object({}).strict().optional()

export const importEmployeesSchema = z.object({
  employees: z.array(z.object({
    name: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    department: z.string().max(120).optional(),
    status: z.enum(['ACTIVE', 'ON_LEAVE']).optional(),
    email: z.string().email().optional(),
    location: z.string().max(200).optional(),
    salary: z.number().nonnegative().optional(),
    employeeNumber: z.string().max(64).optional(),
    hiredAt: z.string().optional(),
  })).min(1).max(500),
})
