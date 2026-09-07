/**
 * TanStack Query key factory.
 *
 * One hierarchical namespace per module, mirroring the API's route prefixes
 * (`/api/v1/<module>`). Every leaf key is derived from its parent via spread, so invalidating
 * `queryKeys.hr.all()` invalidates every employee/department/payroll/etc. query at once, while
 * a mutation can still target just `queryKeys.hr.employees.detail(id)`.
 *
 * Filters/params are included in list keys as plain objects — TanStack Query serializes query
 * keys structurally, so `{ status: 'ACTIVE' }` and `{ status: 'ACTIVE', page: 1 }` are distinct
 * cache entries without any manual string-building.
 */

const root = ['asas'] as const

function moduleKeys<Name extends string>(name: Name) {
  return {
    all: () => [...root, name] as const,
  }
}

function resourceKeys<Base extends readonly unknown[]>(base: Base) {
  return {
    all: () => [...base] as const,
    lists: () => [...base, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...base, 'list', filters ?? {}] as const,
    details: () => [...base, 'detail'] as const,
    detail: (id: string) => [...base, 'detail', id] as const,
  }
}

const authBase = moduleKeys('auth')
const tenantBase = moduleKeys('tenant')

const hrBase = moduleKeys('hr')
const hrEmployeesBase = [...hrBase.all(), 'employees'] as const
const hrDepartmentsBase = [...hrBase.all(), 'departments'] as const
const hrPayrollRunsBase = [...hrBase.all(), 'payroll-runs'] as const
const hrCandidatesBase = [...hrBase.all(), 'candidates'] as const
const hrAttendanceBase = [...hrBase.all(), 'attendance'] as const
const hrLeaveRequestsBase = [...hrBase.all(), 'leave-requests'] as const

const financeBase = moduleKeys('finance')
const financePayablesBase = [...financeBase.all(), 'payables'] as const
const financeReceivablesBase = [...financeBase.all(), 'receivables'] as const
const financeExpensesBase = [...financeBase.all(), 'expenses'] as const

const crmBase = moduleKeys('crm')
const crmDealsBase = [...crmBase.all(), 'deals'] as const

const projectsBase = moduleKeys('projects')
const projectsPortfolioBase = [...projectsBase.all(), 'portfolio'] as const
const projectsSprintsBase = [...projectsBase.all(), 'sprints'] as const
const projectsIssuesBase = [...projectsBase.all(), 'issues'] as const
const projectsRoadmapBase = [...projectsBase.all(), 'roadmap'] as const

const inventoryBase = moduleKeys('inventory')
const inventoryProductsBase = [...inventoryBase.all(), 'products'] as const
const inventoryMovementsBase = [...inventoryBase.all(), 'movements'] as const
const inventoryStockLevelsBase = [...inventoryBase.all(), 'stock-levels'] as const
const inventoryStockAlertsBase = [...inventoryBase.all(), 'stock-alerts'] as const
const inventoryWarehousesBase = [...inventoryBase.all(), 'warehouses'] as const

const exportsBase = moduleKeys('exports')
const settingsBase = moduleKeys('settings')
const dashboardBase = moduleKeys('dashboard')
const supportBase = moduleKeys('support')

export const queryKeys = {
  all: () => root,

  auth: {
    ...authBase,
    me: () => [...authBase.all(), 'me'] as const,
  },

  tenant: {
    ...tenantBase,
    current: () => [...tenantBase.all(), 'current'] as const,
  },

  hr: {
    ...hrBase,
    employees: resourceKeys(hrEmployeesBase),
    departments: resourceKeys(hrDepartmentsBase),
    payrollRuns: resourceKeys(hrPayrollRunsBase),
    candidates: resourceKeys(hrCandidatesBase),
    attendance: resourceKeys(hrAttendanceBase),
    leaveRequests: resourceKeys(hrLeaveRequestsBase),
  },

  finance: {
    ...financeBase,
    payables: resourceKeys(financePayablesBase),
    receivables: resourceKeys(financeReceivablesBase),
    expenses: resourceKeys(financeExpensesBase),
  },

  crm: {
    ...crmBase,
    overview: () => [...crmBase.all(), 'overview'] as const,
    deals: resourceKeys(crmDealsBase),
    forecast: () => [...crmBase.all(), 'forecast'] as const,
    salesPerformance: () => [...crmBase.all(), 'sales-performance'] as const,
  },

  projects: {
    ...projectsBase,
    projects: resourceKeys(projectsBase.all()),
    portfolio: resourceKeys(projectsPortfolioBase),
    sprints: resourceKeys(projectsSprintsBase),
    issues: resourceKeys(projectsIssuesBase),
    roadmap: () => [...projectsRoadmapBase] as const,
    burndown: (sprintId: string, filters?: Record<string, unknown>) =>
      [...projectsSprintsBase, sprintId, 'burndown', filters ?? {}] as const,
  },

  inventory: {
    ...inventoryBase,
    products: resourceKeys(inventoryProductsBase),
    movements: resourceKeys(inventoryMovementsBase),
    stockLevels: () => [...inventoryStockLevelsBase] as const,
    stockAlerts: () => [...inventoryStockAlertsBase] as const,
    warehouses: () => [...inventoryWarehousesBase] as const,
  },

  exports: {
    jobs: resourceKeys(exportsBase.all()),
  },

  settings: {
    ...settingsBase,
    general: () => [...settingsBase.all(), 'general'] as const,
    notifications: () => [...settingsBase.all(), 'notifications'] as const,
    integrations: resourceKeys([...settingsBase.all(), 'integrations'] as const),
  },

  dashboard: {
    ...dashboardBase,
    overview: () => [...dashboardBase.all(), 'overview'] as const,
  },

  support: {
    ...supportBase,
  },
}
