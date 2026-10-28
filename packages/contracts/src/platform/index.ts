import { z } from 'zod'
import { platformRoleSchema } from '../enums.generated.js'
import { paginationMetaSchema, paginationQuerySchema } from '../primitives/pagination.js'

/**
 * Platform-operator roles are separate from workspace `UserRole`. The enum itself is generated
 * from the Prisma schema, so only the platform-specific alias lives here.
 */
export type PlatformRoleName = z.infer<typeof platformRoleSchema>

/**
 * Platform route identifiers. Better Auth generates its own user and organization IDs rather
 * than relying on Prisma's cuid default, so the tenant-owned `idParamSchema` is too strict here.
 */
export const platformIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
})

export const platformMeSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  platformRole: platformRoleSchema,
  twoFactorEnabled: z.boolean(),
  twoFactorVerified: z.boolean(),
  requiresTwoFactor: z.boolean(),
  requiresTwoFactorVerification: z.boolean(),
  nodeEnv: z.string(),
  isProduction: z.boolean(),
})

/**
 * Platform-console step-up. `ENROLL` is a different failure than a wrong code: the account has
 * no TOTP secret yet, so no code would be accepted. The client sends the same verification
 * input for a TOTP code and a one-time recovery code.
 */
export const platformStepUpSchema = z.object({
  method: z.enum(['totp', 'backup-code']),
  code: z.string().trim().min(6).max(64),
})

export const platformStepUpResponseSchema = z.object({
  verified: z.literal(true),
  verifiedAt: z.string(),
})

export const platformPublicConfigSchema = z.object({
  maintenanceMode: z.boolean(),
  signupsEnabled: z.boolean(),
  exportsEnabled: z.boolean(),
})

export const platformFlagKeySchema = z.enum(['maintenance_mode', 'signups_enabled', 'exports_enabled'])
export const platformFlagsSchema = z.object({
  maintenanceMode: z.boolean(),
  signupsEnabled: z.boolean(),
  exportsEnabled: z.boolean(),
  updatedAt: z.string().nullable(),
})

const platformTenantStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED'])

export const platformOverviewSchema = z.object({
  workspaceCount: z.int().min(0),
  activeWorkspaceCount: z.int().min(0),
  suspendedWorkspaceCount: z.int().min(0),
  userCount: z.int().min(0),
  activeSubscriptionCount: z.int().min(0),
  pastDueSubscriptionCount: z.int().min(0),
  mrr: z.string(),
  currency: z.string(),
  reportedStorageGb: z.number(),
  newWorkspaces30d: z.int().min(0),
  newUsers30d: z.int().min(0),
  planMix: z.array(z.object({ planName: z.string(), count: z.int().min(0) })),
  recentAudit: z.array(z.object({
    id: z.string(),
    action: z.string(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    createdAt: z.string(),
  })),
})

export const platformWorkspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: platformTenantStatusSchema,
  onboardingStatus: z.string(),
  planName: z.string(),
  priceMonthly: z.string(),
  currency: z.string(),
  seatsUsed: z.int().min(0),
  seatLimit: z.int().min(0),
  storageUsedGb: z.number().nullable(),
  createdAt: z.string(),
})

export const platformWorkspaceListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['ALL', 'ACTIVE', 'SUSPENDED']).default('ALL'),
  plan: z.string().trim().max(80).optional(),
})

export const platformWorkspaceListResponseSchema = z.object({
  items: z.array(platformWorkspaceSummarySchema),
  pagination: paginationMetaSchema,
  summary: z.object({
    total: z.int().min(0),
    active: z.int().min(0),
    suspended: z.int().min(0),
  }),
})

export const platformWorkspaceMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  createdAt: z.string(),
})

export const platformWorkspaceDetailSchema = z.object({
  workspace: platformWorkspaceSummarySchema.extend({
    supportEmail: z.string().nullable(),
    timezone: z.string(),
    currency: z.string(),
    suspendedAt: z.string().nullable(),
    suspendedReason: z.string().nullable(),
  }),
  subscription: z.object({
    id: z.string(),
    planName: z.string(),
    status: z.string(),
    priceMonthly: z.string(),
    currency: z.string(),
    renewsOn: z.string().nullable(),
    stripeSubscriptionId: z.string().nullable(),
    stripeCustomerId: z.string().nullable(),
    seatsUsed: z.int().min(0),
    seatLimit: z.int().min(0),
    storageLimitGb: z.number(),
  }).nullable(),
  members: z.array(platformWorkspaceMemberSchema),
  footprint: z.object({
    employees: z.int().min(0),
    payableInvoices: z.int().min(0),
    receivableInvoices: z.int().min(0),
    deals: z.int().min(0),
    projects: z.int().min(0),
    products: z.int().min(0),
  }),
  recentAudit: z.array(z.object({
    id: z.string(),
    action: z.string(),
    actorId: z.string().nullable(),
    createdAt: z.string(),
  })),
})

export const platformWorkspaceStatusUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(3).max(500).optional(),
})

export const platformWorkspacePlanUpdateSchema = z.object({
  planId: z.enum(['free', 'starter', 'pro', 'enterprise']),
})

export const platformUserListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  verified: z.enum(['ALL', 'VERIFIED', 'UNVERIFIED']).default('ALL'),
  twoFactor: z.enum(['ALL', 'ENABLED', 'DISABLED']).default('ALL'),
})

export const platformUserSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  platformRole: platformRoleSchema,
  createdAt: z.string(),
  memberships: z.array(z.object({ tenantId: z.string(), tenantName: z.string(), role: z.string() })),
  lastSessionAt: z.string().nullable(),
})

export const platformUserListResponseSchema = z.object({
  items: z.array(platformUserSummarySchema),
  pagination: paginationMetaSchema,
  summary: z.object({
    total: z.int().min(0),
    unverified: z.int().min(0),
    withTwoFactor: z.int().min(0),
  }),
})

export const platformUserDetailSchema = z.object({
  user: platformUserSummarySchema,
  sessions: z.array(z.object({
    id: z.string(),
    createdAt: z.string(),
    expiresAt: z.string(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
  })),
  recentAudit: z.array(z.object({
    id: z.string(),
    action: z.string(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    createdAt: z.string(),
  })),
})

export const platformBillingResponseSchema = z.object({
  summary: z.object({
    activeSubscriptions: z.int().min(0),
    pastDueSubscriptions: z.int().min(0),
    mrr: z.string(),
    currency: z.string(),
    invoiceTotal: z.string(),
    invoiceCount: z.int().min(0),
  }),
  subscriptions: z.array(z.object({
    id: z.string(),
    tenantId: z.string(),
    tenantName: z.string(),
    planName: z.string(),
    status: z.string(),
    priceMonthly: z.string(),
    currency: z.string(),
    renewsOn: z.string().nullable(),
    stripeSubscriptionId: z.string().nullable(),
    stripeCustomerId: z.string().nullable(),
  })),
  invoices: z.array(z.object({
    id: z.string(),
    tenantId: z.string(),
    tenantName: z.string(),
    date: z.string(),
    description: z.string(),
    amount: z.string(),
    currency: z.string(),
    status: z.string(),
    stripeInvoiceId: z.string().nullable(),
  })),
})

export const platformHealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['connected', 'unavailable']),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
  nodeEnv: z.string(),
  storageDriver: z.string(),
  emailDelivery: z.enum(['configured', 'disabled']),
  queueMode: z.enum(['pg-boss', 'inline']),
  redisConfigured: z.boolean(),
  exportJobs: z.object({
    queued: z.int().min(0),
    running: z.int().min(0),
    failed: z.int().min(0),
    done: z.int().min(0),
  }),
  failedJobs: z.array(z.object({
    id: z.string(),
    tenantId: z.string(),
    tenantName: z.string(),
    filename: z.string(),
    updatedAt: z.string(),
  })),
})

export const platformAuditListQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(120).optional(),
})

export const platformAuditEntrySchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
})

export const platformAuditListResponseSchema = z.object({
  items: z.array(platformAuditEntrySchema),
  pagination: paginationMetaSchema,
  summary: z.null(),
})
