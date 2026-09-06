export const meta = {
  name: 'complete-rebuild-plan',
  description: 'Complete all remaining Asas rebuild plan items',
  phases: [
    { title: 'Phase 1 Foundations', detail: 'Verify monorepo, money, auth, RBAC, shadcn, formatting, charts, query layer, CI' },
    { title: 'Phase 2 HR Slice', detail: 'Verify domain extraction, service refactoring, API, UI, RBAC, features, tests' },
    { title: 'Phase 3 Finance', detail: 'Verify AP/AR SQL aggregates, pagination, PDF export, ledger' },
    { title: 'Phase 4 CRM', detail: 'Verify real queries, Kanban, remove fabrications' },
    { title: 'Phase 5 Projects', detail: 'Verify burndown SQL, Gantt, write schemas' },
    { title: 'Phase 6 Inventory+Settings', detail: 'Verify stock levels, alerts, warehouses, settings UI' },
    { title: 'Phase 7 Cross-cutting', detail: 'Implement SSE, observability, E2E, bundle size' },
    { title: 'Final Verification', detail: 'Verify all phases 0-7 criteria' }
  ]
}

phase('Phase 1 Foundations')

// Check monorepo structure
const monorepoCheck = await agent('Verify monorepo structure exists: apps/api, apps/web, packages/contracts, packages/domain with proper pnpm-workspace.yaml and turbo.json', {
  schema: {
    type: 'object',
    properties: {
      exists: { type: 'boolean' },
      apps: { type: 'object', properties: { api: { type: 'boolean' }, web: { type: 'boolean' } } },
      packages: { type: 'object', properties: { contracts: { type: 'boolean' }, domain: { type: 'boolean' } } },
      workspaces: { type: 'boolean' },
      turbo: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['exists', 'apps', 'packages', 'workspaces', 'turbo', 'missing']
  }
})

// Check Money primitive
const moneyCheck = await agent('Verify Money class in packages/domain/src/money/money.ts with fromCents, add, subtract, multiply, allocate, toDecimal methods and comprehensive tests in packages/domain/src/money/money.test.ts', {
  schema: {
    type: 'object',
    properties: {
      moneyClass: { type: 'boolean' },
      methods: { type: 'array', items: { type: 'string' } },
      tests: { type: 'boolean' },
      decimalSchema: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['moneyClass', 'methods', 'tests', 'decimalSchema', 'missing']
  }
})

// Check Better Auth + RBAC
const authCheck = await agent('Verify Better Auth with organization plugin mapped to Tenant table in apps/api/src/auth.ts, httpOnly cookies, CASL-style RBAC in apps/api/src/middlewares/rbac.ts, tenant isolation working', {
  schema: {
    type: 'object',
    properties: {
      betterAuth: { type: 'boolean' },
      organizationPlugin: { type: 'boolean' },
      tenantMapping: { type: 'boolean' },
      httpOnlyCookies: { type: 'boolean' },
      rbac: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['betterAuth', 'organizationPlugin', 'tenantMapping', 'httpOnlyCookies', 'rbac', 'missing']
  }
})

// Check shadcn/ui + token bridge
const shadcnCheck = await agent('Verify shadcn components exist in apps/web/src/components/ui/: button.tsx, badge.tsx, card.tsx, dialog.tsx, sheet.tsx, select.tsx, input.tsx, tabs.tsx, toast.tsx, data-table.tsx. Verify token bridge in apps/web/src/lib/tokens.ts mapping to existing design tokens', {
  schema: {
    type: 'object',
    properties: {
      components: { type: 'array', items: { type: 'string' } },
      tokenBridge: { type: 'boolean' },
      darkMode: { type: 'boolean' },
      hexColorsRemoved: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['components', 'tokenBridge', 'darkMode', 'hexColorsRemoved', 'missing']
  }
})

// Check formatting utilities
const formatCheck = await agent('Verify format.ts in apps/web/src/lib/format.ts with formatMoney, formatCompact, formatDate, formatPercent, sourced from workspace settings, and all duplicate formatters removed from codebase', {
  schema: {
    type: 'object',
    properties: {
      formatMoney: { type: 'boolean' },
      formatCompact: { type: 'boolean' },
      formatDate: { type: 'boolean' },
      formatPercent: { type: 'boolean' },
      duplicatesRemoved: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['formatMoney', 'formatCompact', 'formatDate', 'formatPercent', 'duplicatesRemoved', 'missing']
  }
})

// Check chart foundation
const chartCheck = await agent('Verify Recharts 3 integration with ChartContainer/ChartConfig in apps/web/src/components/ui/chart.tsx, token-driven colors, accessibilityLayer enabled, FinanceOverview.jsx as reference pattern', {
  schema: {
    type: 'object',
    properties: {
      recharts3: { type: 'boolean' },
      chartConfig: { type: 'boolean' },
      tokenColors: { type: 'boolean' },
      accessibility: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['recharts3', 'chartConfig', 'tokenColors', 'accessibility', 'missing']
  }
})

// Check query layer
const queryCheck = await agent('Verify TanStack Query with queryKeys factory in apps/web/src/constants/queryKeys.ts, invalidateQueries on mutations, optimistic updates, staleTime configuration', {
  schema: {
    type: 'object',
    properties: {
      queryKeys: { type: 'boolean' },
      invalidateQueries: { type: 'boolean' },
      optimisticUpdates: { type: 'boolean' },
      staleTime: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['queryKeys', 'invalidateQueries', 'optimisticUpdates', 'staleTime', 'missing']
  }
})

// Check CI configuration
const ciCheck = await agent('Verify .github/workflows/ci.yml with lint, typecheck, test, build jobs and contract tests for Zod/Prisma enum consistency', {
  schema: {
    type: 'object',
    properties: {
      ciWorkflow: { type: 'boolean' },
      lint: { type: 'boolean' },
      typecheck: { type: 'boolean' },
      test: { type: 'boolean' },
      build: { type: 'boolean' },
      contractTests: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['ciWorkflow', 'lint', 'typecheck', 'test', 'build', 'contractTests', 'missing']
  }
})

phase('Phase 2 HR Slice')

// Check domain layer
const hrDomainCheck = await agent('Verify packages/domain/payroll.ts with calculateGrossPay, calculateDeductions, calculateTaxLines, calculateNetPay, DEFAULT_TAX_BRACKETS, and comprehensive unit tests in packages/domain/__tests__/payroll.test.ts', {
  schema: {
    type: 'object',
    properties: {
      payrollFunctions: { type: 'array', items: { type: 'string' } },
      taxBrackets: { type: 'boolean' },
      unitTests: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['payrollFunctions', 'taxBrackets', 'unitTests', 'missing']
  }
})

// Check service layer
const hrServiceCheck = await agent('Verify apps/api/src/modules/hr/hr.service.js with all methods: createEmployee, updateEmployee, deleteEmployee, getEmployee, createDepartment, listEmployees, listPayrollRuns, approvePayrollRun, createLeaveRequest, listAttendance, calculateAttendanceRate, createCandidate, updateCandidateStage, patchPayrollLine, listCandidates', {
  schema: {
    type: 'object',
    properties: {
      methods: { type: 'array', items: { type: 'string' } },
      tenantIsolation: { type: 'boolean' },
      domainLayerUsed: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['methods', 'tenantIsolation', 'domainLayerUsed', 'missing']
  }
})

// Check correctness fixes
const hrFixesCheck = await agent('Verify fixes in HR: openRoles server-side calculation, departmentId/managerId tenant validation, listAttendance uses AttendanceException model, attendance rate from real exception rows', {
  schema: {
    type: 'object',
    properties: {
      openRoles: { type: 'boolean' },
      tenantValidation: { type: 'boolean' },
      attendanceException: { type: 'boolean' },
      attendanceRate: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['openRoles', 'tenantValidation', 'attendanceException', 'attendanceRate', 'missing']
  }
})

// Check UI implementation
const hrUICheck = await agent('Verify forms/dialogs for all 11 HR service methods in apps/web/src/pages/dashboard/hr/, EmployeeList.jsx and Payroll.jsx ported to shadcn components, proper loading/error/empty states', {
  schema: {
    type: 'object',
    properties: {
      forms: { type: 'array', items: { type: 'string' } },
      employeeList: { type: 'boolean' },
      payroll: { type: 'boolean' },
      states: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['forms', 'employeeList', 'payroll', 'states', 'missing']
  }
})

// Check features
const hrFeaturesCheck = await agent('Verify payslip PDF generation, CV upload via presigned URL, CV preview via pdf.js, employee-directory Excel export via exceljs, all queued through pg-boss in apps/api/src/services/', {
  schema: {
    type: 'object',
    properties: {
      payslipPDF: { type: 'boolean' },
      cvUpload: { type: 'boolean' },
      cvPreview: { type: 'boolean' },
      excelExport: { type: 'boolean' },
      pgBoss: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['payslipPDF', 'cvUpload', 'cvPreview', 'excelExport', 'pgBoss', 'missing']
  }
})

// Check RBAC
const hrRBACCheck = await agent('Verify payroll approval and salary visibility gated and audit-logged in apps/api/src/middlewares/rbac.ts, CASL policies defined and enforced', {
  schema: {
    type: 'object',
    properties: {
      payrollApproval: { type: 'boolean' },
      salaryVisibility: { type: 'boolean' },
      auditLog: { type: 'boolean' },
      caslPolicies: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['payrollApproval', 'salaryVisibility', 'auditLog', 'caslPolicies', 'missing']
  }
})

// Check tests
const hrTestsCheck = await agent('Verify vitest run packages/domain green with fixture asserting payroll totals to the cent, Playwright E2E signup → onboarding → create employee → run payroll → download payslip, payslip PDF byte-identical on re-fetch, zero .reduce() in HR pages', {
  schema: {
    type: 'object',
    properties: {
      vitest: { type: 'boolean' },
      payrollFixture: { type: 'boolean' },
      playwright: { type: 'boolean' },
      e2eFlow: { type: 'boolean' },
      pdfIdentical: { type: 'boolean' },
      noReduce: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['vitest', 'payrollFixture', 'playwright', 'e2eFlow', 'pdfIdentical', 'noReduce', 'missing']
  }
})

phase('Phase 3 Finance')

// Check SQL aggregates
const financeSQLCheck = await agent('Verify AP totals and AR aging report moved to SQL with CASE WHEN over date ranges in apps/api/src/modules/finance/finance.service.js, single query returning { items, page, summary }, pagination added to listPayables', {
  schema: {
    type: 'object',
    properties: {
      apTotals: { type: 'boolean' },
      arAging: { type: 'boolean' },
      singleQuery: { type: 'boolean' },
      pagination: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['apTotals', 'arAging', 'singleQuery', 'pagination', 'missing']
  }
})

// Check fixes
const financeFixesCheck = await agent('Verify cashFlows.sort by [year, month] fix, Math.abs() removed from listReceivables, invoice PDF generation in apps/api/src/services/pdf.ts, ledger export in apps/api/src/services/export.ts', {
  schema: {
    type: 'object',
    properties: {
      cashFlowsSort: { type: 'boolean' },
      absRemoved: { type: 'boolean' },
      invoicePDF: { type: 'boolean' },
      ledgerExport: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['cashFlowsSort', 'absRemoved', 'invoicePDF', 'ledgerExport', 'missing']
  }
})

phase('Phase 4 CRM')

// Check real queries
const crmQueryCheck = await agent('Verify getOverview, getForecast, getSalesPerformance use real queries in apps/api/src/modules/crm/crm.service.js: funnel from Deal.stage, win rate from actual data, forecast from ForecastSnapshot/SalesQuota, TARGETS removed, factors array removed, CHART_DATA removed, CLOSED_SPARK removed, REP_SPARKS removed, WIN_LOSS_DATA removed', {
  schema: {
    type: 'object',
    properties: {
      getOverview: { type: 'boolean' },
      getForecast: { type: 'boolean' },
      getSalesPerformance: { type: 'boolean' },
      realFunnel: { type: 'boolean' },
      realWinRate: { type: 'boolean' },
      realForecast: { type: 'boolean' },
      fabricationsRemoved: { type: 'array', items: { type: 'string' } },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['getOverview', 'getForecast', 'getSalesPerformance', 'realFunnel', 'realWinRate', 'realForecast', 'fabricationsRemoved', 'missing']
  }
})

// Check Kanban
const crmKanbanCheck = await agent('Verify Kanban board implemented with dnd-kit in apps/web/src/pages/dashboard/crm/DealsPipeline.jsx, drag-and-drop functionality, stage transitions, proper accessibility', {
  schema: {
    type: 'object',
    properties: {
      dndKit: { type: 'boolean' },
      dragAndDrop: { type: 'boolean' },
      stageTransitions: { type: 'boolean' },
      accessibility: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['dndKit', 'dragAndDrop', 'stageTransitions', 'accessibility', 'missing']
  }
})

phase('Phase 5 Projects')

// Check SQL aggregates
const projectsSQLCheck = await agent('Verify sprint burndown and portfolio utilization moved to SQL in apps/api/src/modules/projects/projects.service.js, Gantt implementation with gantt-task-react in apps/web/src/pages/dashboard/projects/', {
  schema: {
    type: 'object',
    properties: {
      burndown: { type: 'boolean' },
      utilization: { type: 'boolean' },
      gantt: { type: 'boolean' },
      ganttLibrary: { type: 'string' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['burndown', 'utilization', 'gantt', 'ganttLibrary', 'missing']
  }
})

// Check write schemas
const projectsSchemasCheck = await agent('Verify unused projects.schema.js write schemas wired to real routes in apps/api/src/modules/projects/projects.controller.js', {
  schema: {
    type: 'object',
    properties: {
      schemasWired: { type: 'boolean' },
      routes: { type: 'array', items: { type: 'string' } },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['schemasWired', 'routes', 'missing']
  }
})

phase('Phase 6 Inventory+Settings')

// Check Inventory
const inventoryCheck = await agent('Verify stock levels, alerts, warehouses via StockMovement in apps/api/src/modules/inventory/inventory.service.js, all features from README implemented', {
  schema: {
    type: 'object',
    properties: {
      stockLevels: { type: 'boolean' },
      alerts: { type: 'boolean' },
      warehouses: { type: 'boolean' },
      stockMovement: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['stockLevels', 'alerts', 'warehouses', 'stockMovement', 'missing']
  }
})

// Check Settings
const settingsCheck = await agent('Verify SettingsGeneral.jsx has 4 buttons with onClick handlers in apps/web/src/pages/dashboard/settings/SettingsGeneral.jsx, settingsService.updateGeneral wired, Integrations.jsx and Notifications.jsx use real endpoints in apps/web/src/pages/dashboard/settings/', {
  schema: {
    type: 'object',
    properties: {
      buttons: { type: 'boolean' },
      updateGeneral: { type: 'boolean' },
      integrations: { type: 'boolean' },
      notifications: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['buttons', 'updateGeneral', 'integrations', 'notifications', 'missing']
  }
})

phase('Phase 7 Cross-cutting')

// Check SSE
const sseCheck = await agent('Verify GET /api/v1/events endpoint in apps/api/src/plugins/sse.ts emitting { type: "invalidate", keys: [...] }, client calls queryClient.invalidateQueries in apps/web/src/lib/sse.ts, auto-reconnects, no sticky sessions, two browser windows test passes', {
  schema: {
    type: 'object',
    properties: {
      endpoint: { type: 'boolean' },
      eventFormat: { type: 'boolean' },
      clientInvalidation: { type: 'boolean' },
      autoReconnect: { type: 'boolean' },
      noSticky: { type: 'boolean' },
      twoBrowserTest: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['endpoint', 'eventFormat', 'clientInvalidation', 'autoReconnect', 'noSticky', 'twoBrowserTest', 'missing']
  }
})

// Check Observability
const obsCheck = await agent('Verify Pino configured with redaction in apps/api/src/plugins/logger.ts, Sentry integration in apps/api/src/plugins/sentry.ts and apps/web/src/lib/sentry.ts, request correlation ID threaded through in apps/api/src/plugins/correlation.ts', {
  schema: {
    type: 'object',
    properties: {
      pino: { type: 'boolean' },
      redaction: { type: 'boolean' },
      sentry: { type: 'boolean' },
      correlationId: { type: 'boolean' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['pino', 'redaction', 'sentry', 'correlationId', 'missing']
  }
})

// Check E2E
const e2eCheck = await agent('Verify comprehensive E2E suite in apps/web/test/ covering all slices, bundle-size budget in CI (.github/workflows/ci.yml) with target: no chunk over 500 kB', {
  schema: {
    type: 'object',
    properties: {
      comprehensive: { type: 'boolean' },
      allSlices: { type: 'boolean' },
      bundleBudget: { type: 'boolean' },
      maxChunkSize: { type: 'number' },
      missing: { type: 'array', items: { type: 'string' } }
    },
    required: ['comprehensive', 'allSlices', 'bundleBudget', 'maxChunkSize', 'missing']
  }
})

phase('Final Verification')

// Final comprehensive check
const finalCheck = await agent('Verify ALL Phase 0-7 criteria: pnpm typecheck clean across all workspaces, prisma migrate dev applies from zero on empty Postgres, register → login → refresh → logout with no token in localStorage and httpOnly cookie present, MEMBER receives 403 on payroll.approve, toggle dark mode and confirm every surface responds, Storybook or token page showing all 10 components in light and dark, vitest run packages/domain green with fixture asserting payroll totals to the cent, Playwright E2E signup → onboarding → create employee → approve payroll → download payslip, payslip PDF byte-identical on re-fetch, grep HR pages for .reduce( returns zero, every KPI traced to SQL aggregate not browser reduce, contract test asserting Zod enums equal Prisma enums, grep -c "#[0-9a-fA-F]{6}" on ported pages returns 0, two browser windows mutation refresh within second via SSE, kill and restart API and confirm client reconnects', {
  schema: {
    type: 'object',
    properties: {
      typecheck: { type: 'boolean' },
      migrations: { type: 'boolean' },
      authFlow: { type: 'boolean' },
      darkMode: { type: 'boolean' },
      components: { type: 'boolean' },
      vitest: { type: 'boolean' },
      playwright: { type: 'boolean' },
      build: { type: 'boolean' },
      bundleSize: { type: 'boolean' },
      noStack: { type: 'boolean' },
      listDeals: { type: 'boolean' },
      rateLimit: { type: 'boolean' },
      tenantIsolation: { type: 'boolean' },
      rbac: { type: 'boolean' },
      noReduce: { type: 'boolean' },
      noHexColors: { type: 'boolean' },
      decimalMoney: { type: 'boolean' },
      sqlAggregates: { type: 'boolean' },
      noFabrications: { type: 'boolean' },
      sse: { type: 'boolean' },
      observability: { type: 'boolean' },
      allIssues: { type: 'array', items: { type: 'string' } }
    },
    required: ['typecheck', 'migrations', 'authFlow', 'darkMode', 'components', 'vitest', 'playwright', 'build', 'bundleSize', 'noStack', 'listDeals', 'rateLimit', 'tenantIsolation', 'rbac', 'noReduce', 'noHexColors', 'decimalMoney', 'sqlAggregates', 'noFabrications', 'sse', 'observability', 'allIssues']
  }
})

// Collect all missing items
const allMissing = [
  ...(monorepoCheck?.missing || []),
  ...(moneyCheck?.missing || []),
  ...(authCheck?.missing || []),
  ...(shadcnCheck?.missing || []),
  ...(formatCheck?.missing || []),
  ...(chartCheck?.missing || []),
  ...(queryCheck?.missing || []),
  ...(ciCheck?.missing || []),
  ...(hrDomainCheck?.missing || []),
  ...(hrServiceCheck?.missing || []),
  ...(hrFixesCheck?.missing || []),
  ...(hrUICheck?.missing || []),
  ...(hrFeaturesCheck?.missing || []),
  ...(hrRBACCheck?.missing || []),
  ...(hrTestsCheck?.missing || []),
  ...(financeSQLCheck?.missing || []),
  ...(financeFixesCheck?.missing || []),
  ...(crmQueryCheck?.missing || []),
  ...(crmKanbanCheck?.missing || []),
  ...(projectsSQLCheck?.missing || []),
  ...(projectsSchemasCheck?.missing || []),
  ...(inventoryCheck?.missing || []),
  ...(settingsCheck?.missing || []),
  ...(sseCheck?.missing || []),
  ...(obsCheck?.missing || []),
  ...(e2eCheck?.missing || []),
  ...(finalCheck?.allIssues || [])
].filter(Boolean)

log(`\n=== ASAS REBUILD PLAN COMPLETION REPORT ===`)
log(`Total missing items: ${allMissing.length}`)

if (allMissing.length === 0) {
  log('✅ ALL PHASES 0-7 COMPLETE - REBUILD PLAN FULLY IMPLEMENTED')
} else {
  log('⚠️ REBUILD PLAN PARTIALLY COMPLETE - MISSING ITEMS:')
  allMissing.forEach((item, index) => log(`${index + 1}. ${item}`))
}

return {
  summary: {
    totalMissing: allMissing.length,
    complete: allMissing.length === 0
  },
  phases: {
    phase1: { monorepo: monorepoCheck, money: moneyCheck, auth: authCheck, shadcn: shadcnCheck, format: formatCheck, charts: chartCheck, query: queryCheck, ci: ciCheck },
    phase2: { domain: hrDomainCheck, service: hrServiceCheck, fixes: hrFixesCheck, ui: hrUICheck, features: hrFeaturesCheck, rbac: hrRBACCheck, tests: hrTestsCheck },
    phase3: { sql: financeSQLCheck, fixes: financeFixesCheck },
    phase4: { queries: crmQueryCheck, kanban: crmKanbanCheck },
    phase5: { sql: projectsSQLCheck, schemas: projectsSchemasCheck },
    phase6: { inventory: inventoryCheck, settings: settingsCheck },
    phase7: { sse: sseCheck, observability: obsCheck, e2e: e2eCheck },
    verification: finalCheck
  },
  allMissing
}