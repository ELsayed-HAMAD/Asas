import { z } from 'zod'

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(128),
  tenantName: z.string().trim().min(2).max(100).optional(),
})
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })
