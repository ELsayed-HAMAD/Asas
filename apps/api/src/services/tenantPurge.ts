/**
 * Tenant-scoped business models in foreign-key-safe deletion order.
 *
 * The sample pack writes all of these and the workspace purge removes all of them, so the order
 * lives here once. Each model carries a `tenantId`; every *child* model that lacks one
 * (`PayrollTaxLine`, `TimesheetDay`, `DealActivity`, `IssueComment`, `RoadmapTaskAssignee`, …) is
 * tied to its parent by an `onDelete: Cascade` relation, so deleting the parent removes it too.
 *
 * Ordered child-parent-first where a child is itself tenant-scoped AND references a sibling
 * tenant-scoped model (e.g. `StockMovement` → `Product`, `PayrollLine` → `Employee`). Those
 * relations are RESTRICT/NO ACTION, so a bare `tenant.delete()` cascade fails on them — this list
 * is the minimal set that unblocks it.
 */
export type TenantPurgeModel =
  | 'journalLine'
  | 'journalEntry'
  | 'ledgerAccount'
  | 'payrollLine'
  | 'payrollRun'
  | 'timesheet'
  | 'attendanceException'
  | 'leaveRequest'
  | 'leavePolicy'
  | 'candidate'
  | 'employee'
  | 'department'
  | 'activityEvent'
  | 'payableInvoice'
  | 'receivableInvoice'
  | 'expense'
  | 'ledgerTransaction'
  | 'cashFlowSnapshot'
  | 'vendor'
  | 'customer'
  | 'deal'
  | 'company'
  | 'agendaItem'
  | 'salesQuota'
  | 'forecastSnapshot'
  | 'purchaseOrder'
  | 'stockMovement'
  | 'product'
  | 'supplier'
  | 'issue'
  | 'sprint'
  | 'project'
  | 'roadmapPhase'
  | 'roadmapTask'

export const TENANT_PURGE_MODELS: readonly TenantPurgeModel[] = [
  // Ledger (lines before entries; accounts last so their rows are unreferenced)
  'journalLine',
  'journalEntry',
  'ledgerAccount',
  // HR (leaf-ish first. The payroll run goes before its lines: the paid-payroll guard reads the
  // parent run, so deleting lines directly is refused while the run still says PAID.)
  'payrollRun',
  'payrollLine',
  'timesheet',
  'attendanceException',
  'leaveRequest',
  'leavePolicy',
  'candidate',
  'employee',
  'department',
  'activityEvent',
  // Finance
  'payableInvoice',
  'receivableInvoice',
  'expense',
  'ledgerTransaction',
  'cashFlowSnapshot',
  'vendor',
  'customer',
  // CRM
  'deal',
  'company',
  'agendaItem',
  'salesQuota',
  'forecastSnapshot',
  // Inventory (purchase orders before products: their lines cascade off both)
  'purchaseOrder',
  'stockMovement',
  'product',
  'supplier',
  // Projects
  'issue',
  'sprint',
  'project',
  'roadmapPhase',
  'roadmapTask',
]
