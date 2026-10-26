import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, Boxes, BriefcaseBusiness, Building2, Check, CircleHelp, Database, FileSpreadsheet, Loader2, LockKeyhole, Users } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import SettingsTabs from './SettingsTabs'
import TopBarActions from '../../../components/TopBarActions'
import { settingsApi } from '../../../lib/api/settings'
import { queryKeys } from '../../../lib/queryKeys'
import { useActiveMemberRole } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
import CrmCompanyMigration from './CrmCompanyMigration'
import CrmDealMigration from './CrmDealMigration'
import InventoryProductMigration from './InventoryProductMigration'
import InventoryOpeningStockMigration from './InventoryOpeningStockMigration'
import InventorySupplierMigration from './InventorySupplierMigration'
import FinanceCounterpartyMigration from './FinanceCounterpartyMigration'
import FinanceOpenItemMigration from './FinanceOpenItemMigration'
import FinanceMigrationReconciliation from './FinanceMigrationReconciliation'
import ProjectPortfolioMigration from './ProjectPortfolioMigration'

const MODULES = [
  { id: 'HR', title: 'People & HR', detail: 'Employee records, departments, and related HR data.', icon: Users },
  { id: 'CRM', title: 'CRM', detail: 'Companies, contacts, deals, and sales pipeline history.', icon: Building2 },
  { id: 'FINANCE', title: 'Finance', detail: 'Accounts, opening balances, vendors, customers, and open invoices.', icon: Database },
  { id: 'INVENTORY', title: 'Inventory', detail: 'Products, suppliers, opening stock, and reconciled valuation.', icon: Boxes },
  { id: 'PROJECTS', title: 'Projects', detail: 'Projects, phases, sprints, issues, and ownership.', icon: BriefcaseBusiness },
]
const IMPORT_NAMES = { HR_EMPLOYEES: 'Employee records', CRM_COMPANIES: 'CRM companies', CRM_DEALS: 'CRM deals', INVENTORY_PRODUCTS: 'Inventory products', INVENTORY_OPENING_STOCK: 'Inventory opening stock', INVENTORY_SUPPLIERS: 'Inventory suppliers', INVENTORY_PRODUCT_SUPPLIERS: 'Product–supplier links', FINANCE_CUSTOMERS: 'Finance customers', FINANCE_VENDORS: 'Finance vendors', FINANCE_AP_OPEN_ITEMS: 'AP open items staged', FINANCE_AR_OPEN_ITEMS: 'AR open items staged', FINANCE_OPENING_BALANCE: 'Opening trial balance staged', PROJECTS_PROJECTS: 'Project portfolio' }

function formatDate(value) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

export default function SettingsDataMigration() {
  const queryClient = useQueryClient()
  const { data: memberRole } = useActiveMemberRole()
  const roleName = getMemberRoleName(memberRole)
  const canManage = roleName === 'OWNER' || roleName === 'ADMIN'
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.settings.dataMigrationProjects(),
    queryFn: settingsApi.listDataMigrationProjects,
  })
  const projects = data?.projects ?? []
  const currentProject = useMemo(() => projects.find(project => project.status !== 'COMPLETED') ?? projects[0], [projects])
  const [name, setName] = useState('Company data migration')
  const [sourceSystem, setSourceSystem] = useState('')
  const [targetCutoverAt, setTargetCutoverAt] = useState('')
  const [modules, setModules] = useState([])
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (currentProject) {
      setName(currentProject.name)
      setSourceSystem(currentProject.sourceSystem ?? '')
      setTargetCutoverAt(currentProject.targetCutoverAt ? currentProject.targetCutoverAt.slice(0, 10) : '')
      setModules(currentProject.modules)
    }
  }, [currentProject])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input = {
        name,
        sourceSystem: sourceSystem.trim() || null,
        modules,
        targetCutoverAt: targetCutoverAt ? new Date(`${targetCutoverAt}T12:00:00.000Z`).toISOString() : null,
      }
      return currentProject
        ? settingsApi.updateDataMigrationProject(currentProject.id, input)
        : settingsApi.createDataMigrationProject(input)
    },
    onSuccess: async () => {
      setNotice(currentProject ? 'Migration plan saved.' : 'Company migration project created.')
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })
    },
    onError: error => setNotice(error?.message || 'Could not save the migration plan.'),
  })

  const toggleModule = module => {
    setNotice('')
    setModules(previous => previous.includes(module) ? previous.filter(value => value !== module) : [...previous, module])
  }

  if (isLoading) return <div className="flex flex-1 items-center justify-center bg-surface"><h1 className="sr-only">Data Migration</h1><Loader2 className="animate-spin text-muted" size={24} /></div>
  if (isError || !data) return <div className="flex flex-1 items-center justify-center bg-surface text-danger"><h1 className="sr-only">Data Migration</h1>Could not load migration projects. Refresh and try again.</div>

  const hasChanges = currentProject
    ? name !== currentProject.name
      || sourceSystem !== (currentProject.sourceSystem ?? '')
      || targetCutoverAt !== (currentProject.targetCutoverAt ? currentProject.targetCutoverAt.slice(0, 10) : '')
      || modules.length !== currentProject.modules.length
      || modules.some(module => !currentProject.modules.includes(module))
    : true

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <TopBarActions />
      <SettingsTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-7 p-5 sm:p-8">
          <header className="relative overflow-hidden rounded-2xl border border-border-default bg-surface-raised p-6 shadow-card sm:p-8">
            <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent"><FileSpreadsheet size={17} /> Company data migration</div>
                <h1 className="text-2xl font-semibold tracking-tight text-heading sm:text-3xl">Bring your business data into Asas, in a controlled sequence.</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted">Plan one company migration across teams. Each data type will have its own mapping, validation, and reconciliation step so records stay linked and financial totals remain trustworthy.</p>
              </div>
              <Badge variant="outline" className="w-fit shrink-0">{currentProject ? currentProject.status.replaceAll('_', ' ') : 'Not started'}</Badge>
            </div>
          </header>

          {projects.length > 1 && (
            <section aria-label="Migration history" className="rounded-xl border border-border-default bg-surface-raised p-5">
              <h2 className="text-sm font-semibold text-heading">Migration projects</h2>
              <div className="mt-3 flex flex-wrap gap-2">{projects.map(project => <Badge key={project.id} variant="secondary">{project.name} · {project.status.replaceAll('_', ' ')}</Badge>)}</div>
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
            <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card sm:p-6" aria-labelledby="project-heading">
              <div className="mb-6 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Database size={19} /></div>
                <div><h2 id="project-heading" className="text-lg font-semibold text-heading">{currentProject ? 'Migration project plan' : 'Start your company migration'}</h2><p className="mt-1 text-sm text-muted">Choose the areas to include. You can refine the scope while the project is still in planning.</p></div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-body">Project name<Input value={name} onChange={event => setName(event.target.value)} maxLength={120} disabled={!canManage} /></label>
                <label className="space-y-1.5 text-sm font-medium text-body">Current system or source<Input value={sourceSystem} onChange={event => setSourceSystem(event.target.value)} maxLength={120} placeholder="For example, spreadsheets or an ERP" disabled={!canManage} /></label>
              </div>

              <fieldset className="mt-6">
                <legend className="mb-3 text-sm font-semibold text-heading">Company areas in scope <span className="font-normal text-muted">(select one or more)</span></legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {MODULES.map(({ id, title, detail, icon: Icon }) => {
                    const selected = modules.includes(id)
                    return <button key={id} type="button" aria-pressed={selected} disabled={!canManage} onClick={() => toggleModule(id)} className={`group rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-primary/50 bg-primary/5' : 'border-border-default bg-surface-raised hover:bg-surface-muted'}`}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2.5 font-semibold text-heading"><Icon size={17} className={selected ? 'text-primary' : 'text-muted'} />{title}</span>
                        <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-transparent'}`}><Check size={12} /></span>
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-muted">{detail}</span>
                    </button>
                  })}
                </div>
              </fieldset>

              <div className="mt-5 max-w-xs">
                <label className="space-y-1.5 text-sm font-medium text-body">Target cutover date <span className="font-normal text-muted">(optional)</span><Input type="date" value={targetCutoverAt} onChange={event => setTargetCutoverAt(event.target.value)} disabled={!canManage} /></label>
              </div>

              {notice && <p role="status" className={`mt-4 text-sm ${saveMutation.isError ? 'text-danger' : 'text-success'}`}>{notice}</p>}
              {!canManage && <p className="mt-4 flex items-center gap-2 text-sm text-muted"><LockKeyhole size={15} />Only workspace admins and owners can change migration plans.</p>}
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-5">
                <Button type="button" disabled={!canManage || modules.length === 0 || !name.trim() || saveMutation.isPending || (currentProject && !hasChanges)} onClick={() => saveMutation.mutate()}>
                  {saveMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : currentProject ? 'Save migration plan' : 'Create migration project'}
                </Button>
                {currentProject && <span className="text-xs text-muted">Started {formatDate(currentProject.createdAt)} · Last updated {formatDate(currentProject.updatedAt)}</span>}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card">
                <div className="flex items-center gap-2 text-heading"><CircleHelp size={17} className="text-accent" /><h2 className="text-sm font-semibold">How the migration is organized</h2></div>
                <ol className="mt-4 space-y-4 text-sm">
                  {[
                    ['1', 'Plan scope', 'Set up the workspace and choose the business areas to bring in.'],
                    ['2', 'Import in order', 'Load configuration and master records before linked transactions and balances.'],
                    ['3', 'Review and reconcile', 'Resolve row issues, compare source totals, then approve cutover.'],
                  ].map(([number, title, description]) => <li key={number} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{number}</span><span><strong className="font-semibold text-heading">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-muted">{description}</span></span></li>)}
                </ol>
              </section>

              <section className="rounded-xl border border-warning-border bg-warning-light p-5">
                <div className="flex items-center gap-2 text-warning-text"><ArrowDownToLine size={17} /><h2 className="text-sm font-semibold">Import availability</h2></div>
                <p className="mt-2 text-xs leading-5 text-warning-text">CRM companies/deals, Inventory products and opening stock (with a source cost when valuation is configured), suppliers and product links, Finance customers/vendors, and project portfolio CSV imports are available when those areas are in scope. Finance AP/AR open items and the opening trial balance can now be staged and validated, but are not posted into live invoices or journals until the atomic, reconciled cutover is complete. Inventory valuation, valued receipts/issues, opening valuation, and optional sales-invoice stock/COGS fulfillment on new receivables are available when valuation is configured. Exact supplier-invoice/GRNI matching is available for one fully received, valued, single-line purchase order from the same Finance vendor at an exact amount and currency; pending or rejected bills can correct or clear that link. Partial, multi-line, tax/freight, and price-variance matching, a coordinated Inventory/Finance cutover, other module entities, and direct ERP connectors remain in development.</p>
                <p className="mt-2 text-xs leading-5 text-warning-text">The employee CSV flow remains available during initial setup and its completed batch is recorded here. Other HR datasets and post-setup employee imports are not available yet.</p>
              </section>

              {currentProject?.jobs?.length > 0 && <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card">
                <h2 className="text-sm font-semibold text-heading">Completed import batches</h2>
                <div className="mt-4 space-y-3">{currentProject.jobs.map(job => <div key={job.id} className="flex items-start justify-between gap-3 border-b border-border-subtle pb-3 last:border-0 last:pb-0">
                  <div><p className="text-sm font-medium text-heading">{IMPORT_NAMES[job.entity] ?? job.entity.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-muted">{job.importedRows} of {job.totalRows} rows · {formatDate(job.completedAt)}</p></div>
                  <Badge variant="success">{job.importedRows} imported</Badge>
                </div>)}</div>
              </section>}
              {currentProject?.stagedBatches?.length > 0 && <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card">
                <h2 className="text-sm font-semibold text-heading">Staged Finance batches</h2>
                <p className="mt-1 text-xs leading-5 text-muted">Rows are retained for review and reconciliation. Staged data is not an active invoice or ledger entry.</p>
                <div className="mt-4 space-y-3">{currentProject.stagedBatches.map(batch => <div key={batch.id} className="flex items-start justify-between gap-3 border-b border-border-subtle pb-3 last:border-0 last:pb-0">
                  <div><p className="text-sm font-medium text-heading">{IMPORT_NAMES[batch.entity] ?? batch.entity.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-muted">Batch {batch.sequence} · {batch.stagedRows} of {batch.totalRows} rows · {formatDate(batch.createdAt)}</p></div>
                  <Badge variant={batch.status === 'COMPLETED' ? 'success' : 'secondary'}>{batch.status === 'COMPLETED' ? 'Cut over' : 'Staged'}</Badge>
                </div>)}</div>
              </section>}
            </aside>
          </div>
          {currentProject?.modules.includes('CRM') && <CrmCompanyMigration
            key={currentProject.id}
            projectId={currentProject.id}
            onImported={async () => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })
              await queryClient.invalidateQueries({ queryKey: queryKeys.crm.all() })
            }}
          />}
          {currentProject?.modules.includes('CRM') && <CrmDealMigration
            key={`${currentProject.id}-deals`}
            projectId={currentProject.id}
            onImported={async () => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })
              await queryClient.invalidateQueries({ queryKey: queryKeys.crm.all() })
            }}
          />}
          {currentProject?.modules.includes('INVENTORY') && <InventoryProductMigration
            key={`${currentProject.id}-inventory-products`}
            projectId={currentProject.id}
            onImported={async () => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })
              await queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() })
            }}
          />}
          {currentProject?.modules.includes('INVENTORY') && <InventoryOpeningStockMigration
            key={`${currentProject.id}-inventory-opening-stock`}
            projectId={currentProject.id}
            onImported={async () => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })
              await queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() })
            }}
          />}
          {currentProject?.modules.includes('INVENTORY') && <InventorySupplierMigration
            key={`${currentProject.id}-inventory-suppliers`}
            projectId={currentProject.id}
            onImported={async () => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })
              await queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() })
            }}
          />}
          {currentProject?.modules.includes('FINANCE') && <>
            <FinanceCounterpartyMigration
              key={`${currentProject.id}-finance-customers`}
              projectId={currentProject.id}
              kind="customers"
              onImported={async () => {
                await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })
                await queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() })
              }}
            />
            <FinanceCounterpartyMigration
              key={`${currentProject.id}-finance-vendors`}
              projectId={currentProject.id}
              kind="vendors"
              onImported={async () => {
                await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })
                await queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() })
              }}
            />
            <FinanceOpenItemMigration
              key={`${currentProject.id}-finance-ap-staging`}
              projectId={currentProject.id}
              targetCutoverAt={currentProject.targetCutoverAt}
              kind="ap"
              onStaged={() => queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })}
            />
            <FinanceOpenItemMigration
              key={`${currentProject.id}-finance-ar-staging`}
              projectId={currentProject.id}
              targetCutoverAt={currentProject.targetCutoverAt}
              kind="ar"
              onStaged={() => queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })}
            />
            <FinanceOpenItemMigration
              key={`${currentProject.id}-finance-opening-balance-staging`}
              projectId={currentProject.id}
              targetCutoverAt={currentProject.targetCutoverAt}
              kind="opening"
              onStaged={() => queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })}
            />
            <FinanceMigrationReconciliation key={`${currentProject.id}-finance-reconciliation`} projectId={currentProject.id} canManage={canManage} />
          </>}
          {currentProject?.modules.includes('PROJECTS') && <ProjectPortfolioMigration
            key={`${currentProject.id}-project-portfolio`}
            projectId={currentProject.id}
            onImported={async () => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() })
              await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() })
            }}
          />}
        </div>
      </div>
    </div>
  )
}
