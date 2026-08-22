import { z } from 'zod'

export const companyWriteSchema = z.object({
  name: z.string().min(1),
  tier: z.string().optional(),
  avatarUrl: z.string().url().optional(),
})

export const dealWriteSchema = z.object({
  companyId: z.string().cuid().optional(),
  ownerEmployeeId: z.string().cuid().optional(),
  name: z.string().min(1),
  stage: z.enum(['LEADS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']).optional(),
  value: z.number().min(0).optional(),
  winProbability: z.number().min(0).max(100).optional(),
  closeDate: z.string().datetime().optional(),
  productLine: z.string().optional(),
  forecastBucket: z.string().optional(),
})

export const dealActivityWriteSchema = z.object({
  dealId: z.string().cuid(),
  title: z.string().min(1),
})

export const agendaItemWriteSchema = z.object({
  title: z.string().min(1),
  timeLabel: z.string().optional(),
  priority: z.string().optional(),
  done: z.boolean().optional(),
})

export const salesQuotaWriteSchema = z.object({
  employeeId: z.string().cuid().optional(),
  repName: z.string().min(1),
  period: z.string().min(1),
  quota: z.number().min(0),
})

export const forecastSnapshotWriteSchema = z.object({
  repName: z.string().min(1),
  period: z.string().min(1),
  closed: z.number().optional(),
  commit: z.number().optional(),
  bestCase: z.number().optional(),
  quotaPct: z.number().optional(),
})
