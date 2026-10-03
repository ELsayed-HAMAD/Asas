import type { UserRole } from '@prisma/client'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { hasRequiredRole, resolveAuthContext } from './rbac.js'

/**
 * The declarative permission map (the plan's Phase 1 §5 choice, over a full CASL setup).
 *
 * Every privileged action in the app gets a name here and a minimum role, so a route handler
 * asks for `payroll.approve` rather than a raw role — the map is the one place that answers
 * "who can do this", and it is trivial to audit or change without touching route code.
 *
 * Today this is deliberately just a role-rank lookup (see `hasRequiredRole`), not a full
 * attribute-based system — nothing in this app yet needs "can approve payroll for their own
 * department only" style scoping. If that need shows up, replace the `UserRole` value with a
 * predicate function without changing any call site, since every caller goes through
 * `requirePermission()`, never the map directly.
 */
export const PERMISSIONS = {
  // HR / payroll — the plan's concrete Phase 2 example ("any MEMBER can approve payroll and
  // read every salary" today; this closes that gap).
  'payroll.approve': 'ADMIN',
  'payroll.line.adjust': 'ADMIN',
  'employee.salary.read': 'ADMIN',
  'employee.write': 'ADMIN',
  'employee.delete': 'ADMIN',
  'department.write': 'ADMIN',
  // Candidates — adding a candidate and moving its stage (including uploading a CV) are writes
  // to the recruitment pipeline, gated the same as the other module writes. Reads are open to
  // any MEMBER (requireRole in the route).
  'candidate.write': 'ADMIN',

  // Onboarding — the 3-path flow's writes. Applying the sample pack is a bulk write of the
  // whole business surface (HR, finance, CRM, projects, inventory), so it carries the same
  // gate as every other module write and is audit-logged below.
  'onboarding.write': 'ADMIN',

  // Organization / membership management.
  'member.role.update': 'ADMIN',
  'member.remove': 'ADMIN',
  'organization.delete': 'OWNER',

  // CRM — creating deals and moving them (including stage changes) is a write to pipeline
  // money, so it follows the same ADMIN gate as the other module writes.
  'deal.write': 'ADMIN',

  // Finance — invoices and expenses are writes to the books, gated the same as the other
  // module writes. Master data (vendors/customers) shares the invoice write gate since a new
  // vendor/customer exists to carry an invoice.
  'finance.invoice.write': 'ADMIN',
  'finance.expense.write': 'ADMIN',
  'finance.partner.write': 'ADMIN',

  // Projects / portfolio. Reads are open to any MEMBER (requireRole); writes and deletions
  // require ADMIN, mirroring the HR `employee.write`/`employee.delete` split.
  // Inventory — a product's identity (name/sku/price/thresholds) and its on-hand quantity are
  // both writes to stock data. Quantities only move through a recorded `StockMovement` (see
  // inventory.service.ts), so product CRUD and stock movements share a single write gate,
  // mirroring the other modules' one-permission-per-module split.
  'inventory.write': 'ADMIN',

  'project.write': 'ADMIN',
  'project.delete': 'ADMIN',
  'sprint.write': 'ADMIN',
  'sprint.delete': 'ADMIN',
  'issue.write': 'ADMIN',
  'issue.delete': 'ADMIN',
  'roadmap.write': 'ADMIN',

  // Settings. Reads are open to any MEMBER (requireRole); every write — general profile,
  // notification preferences, and integrations (including storing/clearing a credential) —
  // requires ADMIN, mirroring the other module-write gates.
  'settings.general.update': 'ADMIN',
  'settings.notifications.update': 'ADMIN',
  'settings.integration.write': 'ADMIN',
  'settings.billing.write': 'ADMIN',
  'support.ticket.write': 'MEMBER',
} as const satisfies Record<string, UserRole>

export type Permission = keyof typeof PERMISSIONS

/** Actions attributable enough to belong in the append-only audit log once performed. */
export const AUDITED_PERMISSIONS: ReadonlySet<Permission> = new Set([
  'payroll.approve',
  'payroll.line.adjust',
  'employee.delete',
  'member.role.update',
  'member.remove',
  'organization.delete',
  'onboarding.write',
])

/**
 * Fastify preHandler factory built on top of `requireRole` — the same 401/403/attach
 * behavior, but keyed by a named permission instead of a raw role, and the single place that
 * would grow into per-action predicates if this ever needs more than a role-rank check.
 */
export function requirePermission(permission: Permission) {
  const minimum = PERMISSIONS[permission]
  return async function permissionGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const context = await resolveAuthContext(request.server.auth, request.server.prisma, request.headers)
    if (!context) {
      await reply.code(401).send({ error: { message: 'Authentication required' } })
      return
    }
    if (!hasRequiredRole(context.role, minimum)) {
      await reply.code(403).send({ error: { message: `Requires the '${minimum}' role or higher` } })
      return
    }
    request.authContext = context
  }
}
