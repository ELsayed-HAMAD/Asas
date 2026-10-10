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
 *
 * Tenant scope: every key starts with `['asas', <activeOrgId | 'none'>]` (set via
 * `setQueryScope`), so one workspace's cached data can never be served under another's key.
 * Keys are built lazily at call time, so they always reflect the current scope.
 *
 * The API's SSE invalidation stream sends unscoped prefixes (`moduleKeyPrefix`, e.g.
 * `"asas,finance"`); `scopeServerPrefix` maps those onto the current tenant scope — see `sse.js`.
 */

const ROOT = 'asas'

let activeOrgId = null

/** Point every query key at the active organization (`null` when signed out / no workspace). */
export function setQueryScope(orgId) {
  activeOrgId = orgId ?? null
}

function root() {
  return [ROOT, activeOrgId ?? 'none']
}

/** Map an unscoped server key prefix (`['asas', 'finance']`) onto the current tenant scope. */
export function scopeServerPrefix(segments) {
  if (segments[0] !== ROOT) return segments
  return [...root(), ...segments.slice(1)]
}

function moduleKeys(name) {
  return {
    all: () => [...root(), name],
  }
}

function resourceKeys(base) {
  return {
    all: () => [...base()],
    lists: () => [...base(), 'list'],
    list: (filters) => [...base(), 'list', filters ?? {}],
    details: () => [...base(), 'detail'],
    detail: (id) => [...base(), 'detail', id],
  }
}

const authBase = moduleKeys('auth')
const tenantBase = moduleKeys('tenant')

const hrBase = moduleKeys('hr')
const hrEmployeesBase = () => [...hrBase.all(), 'employees']
const hrDepartmentsBase = () => [...hrBase.all(), 'departments']
const hrPayrollRunsBase = () => [...hrBase.all(), 'payroll-runs']
const hrCandidatesBase = () => [...hrBase.all(), 'candidates']
const hrAttendanceBase = () => [...hrBase.all(), 'attendance']
const hrLeaveRequestsBase = () => [...hrBase.all(), 'leave-requests']
const hrLeaveBalancesBase = () => [...hrBase.all(), 'leave-balances']
const hrLeavePoliciesBase = () => [...hrBase.all(), 'leave-policies']

const financeBase = moduleKeys('finance')
const financePayablesBase = () => [...financeBase.all(), 'payables']
const financeReceivablesBase = () => [...financeBase.all(), 'receivables']
const financeExpensesBase = () => [...financeBase.all(), 'expenses']

const crmBase = moduleKeys('crm')
const crmDealsBase = () => [...crmBase.all(), 'deals']

const projectsBase = moduleKeys('projects')
const projectsPortfolioBase = () => [...projectsBase.all(), 'portfolio']
const projectsSprintsBase = () => [...projectsBase.all(), 'sprints']
const projectsIssuesBase = () => [...projectsBase.all(), 'issues']
const projectsRoadmapBase = () => [...projectsBase.all(), 'roadmap']

const inventoryBase = moduleKeys('inventory')
const inventoryProductsBase = () => [...inventoryBase.all(), 'products']
const inventoryMovementsBase = () => [...inventoryBase.all(), 'movements']
const inventoryStockLevelsBase = () => [...inventoryBase.all(), 'stock-levels']
const inventoryStockAlertsBase = () => [...inventoryBase.all(), 'stock-alerts']
const inventoryWarehousesBase = () => [...inventoryBase.all(), 'warehouses']

const exportsBase = moduleKeys('exports')
const settingsBase = moduleKeys('settings')
const dashboardBase = moduleKeys('dashboard')
const supportBase = moduleKeys('support')
const onboardingBase = moduleKeys('onboarding')

export const queryKeys = {
  all: () => root(),

  auth: {
    ...authBase,
    me: () => [...authBase.all(), 'me'],
  },

  tenant: {
    ...tenantBase,
    current: () => [...tenantBase.all(), 'current'],
  },

  hr: {
    ...hrBase,
    employees: resourceKeys(hrEmployeesBase),
    departments: resourceKeys(hrDepartmentsBase),
    payrollRuns: resourceKeys(hrPayrollRunsBase),
    candidates: resourceKeys(hrCandidatesBase),
    attendance: resourceKeys(hrAttendanceBase),
    leaveRequests: resourceKeys(hrLeaveRequestsBase),
    leaveBalances: resourceKeys(hrLeaveBalancesBase),
    leavePolicies: resourceKeys(hrLeavePoliciesBase),
  },

  finance: {
    ...financeBase,
    payables: resourceKeys(financePayablesBase),
    receivables: resourceKeys(financeReceivablesBase),
    expenses: resourceKeys(financeExpensesBase),
  },

  crm: {
    ...crmBase,
    overview: () => [...crmBase.all(), 'overview'],
    deals: {
      ...resourceKeys(crmDealsBase),
      activities: (id, filters) => [...crmDealsBase(), 'activities', id, filters ?? {}],
    },
    forecast: (year) => year ? [...crmBase.all(), 'forecast', year] : [...crmBase.all(), 'forecast'],
    salesPerformance: (year) => year ? [...crmBase.all(), 'sales-performance', year] : [...crmBase.all(), 'sales-performance'],
    agenda: () => [...crmBase.all(), 'agenda'],
  },

  projects: {
    ...projectsBase,
    projects: resourceKeys(projectsBase.all),
    portfolio: resourceKeys(projectsPortfolioBase),
    sprints: resourceKeys(projectsSprintsBase),
    issues: resourceKeys(projectsIssuesBase),
    roadmap: () => [...projectsRoadmapBase()],
    burndown: (sprintId, filters) =>
      [...projectsSprintsBase(), sprintId, 'burndown', filters ?? {}],
  },

  inventory: {
    ...inventoryBase,
    products: resourceKeys(inventoryProductsBase),
    movements: resourceKeys(inventoryMovementsBase),
    stockLevels: () => [...inventoryStockLevelsBase()],
    stockAlerts: () => [...inventoryStockAlertsBase()],
    warehouses: () => [...inventoryWarehousesBase()],
  },

  exports: {
    ...exportsBase,
    jobs: resourceKeys(exportsBase.all),
  },

  settings: {
    ...settingsBase,
    general: () => [...settingsBase.all(), 'general'],
    exchangeRates: (filters) => [...settingsBase.all(), 'exchange-rates', filters ?? {}],
    billing: () => [...settingsBase.all(), 'billing'],
    backups: () => [...settingsBase.all(), 'backups'],
    notifications: () => [...settingsBase.all(), 'notifications'],
    integrations: resourceKeys(() => [...settingsBase.all(), 'integrations']),
  },

  dashboard: {
    ...dashboardBase,
    overview: () => [...dashboardBase.all(), 'overview'],
  },

  support: {
    ...supportBase,
    tickets: () => [...supportBase.all(), 'tickets'],
  },

  onboarding: {
    ...onboardingBase,
    status: () => [...onboardingBase.all(), 'status'],
  },
}
