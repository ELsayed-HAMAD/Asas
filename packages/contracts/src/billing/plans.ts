import { z } from 'zod'
export { PLATFORM_PLANS } from './catalog.js'
export type { PlatformPlan } from './catalog.js'

export const billingPlanItemSchema = z.object({
  id: z.string().optional(),
  priceId: z.string(),
  name: z.string(),
  tagline: z.string().optional(),
  amount: z.string(),
  priceAnnual: z.number().optional(),
  currency: z.string(),
  interval: z.literal('month'),
  seatLimit: z.number(),
  storageLimitGb: z.number(),
  popular: z.boolean().optional(),
  features: z.array(z.string()).optional(),
  moduleAccess: z.array(z.string()).optional(),
})

export const platformPlansResponseSchema = z.object({
  enabled: z.boolean(),
  stripeConfigured: z.boolean().optional(),
  defaultPlanId: z.string().optional(),
  items: z.array(billingPlanItemSchema),
  tiers: z.array(z.any()).optional(),
})

export type PlatformPlansResponse = z.infer<typeof platformPlansResponseSchema>
