import { useState } from 'react'
import { AlertCircle, CheckCircle2, ClipboardCheck, Loader2, RefreshCw } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import { settingsApi } from '../../../lib/api/settings'
import { queryKeys } from '../../../lib/queryKeys'

function amount(value, currency) {
  if (value == null) return 'Not available'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 4 }).format(Number(value))
}

export default function FinanceMigrationReconciliation({ projectId, canManage = false }) {
  const queryClient = useQueryClient()
  const [requested, setRequested] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: queryKeys.settings.dataMigrationFinanceReconciliation(projectId),
    queryFn: () => settingsApi.previewFinanceMigrationReconciliation(projectId),
    enabled: requested,
    staleTime: 0,
  })
  const cutoverMutation = useMutation({
    mutationFn: () => settingsApi.cutoverFinanceMigration(projectId),
    onSuccess: async () => {
      setConfirmOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationProjects() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.dataMigrationFinanceReconciliation(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() }),
      ])
      setRequested(true)
      await refetch()
    },
  })
  const result = data
  const stateLabel = result?.state === 'CUTOVER_COMPLETED' ? 'Finance cutover completed'
    : result?.state === 'RECONCILED_PENDING_CUTOVER' ? 'Reconciled · ready for cutover'
    : result?.state === 'INCOMPLETE' ? 'More data required' : 'Review required'

  return <section className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-card" aria-labelledby="finance-reconciliation-title">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ClipboardCheck size={19} /></span><div>
        <h2 id="finance-reconciliation-title" className="text-base font-semibold text-heading">Finance reconciliation preview</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Compare staged AP and AR with source control balances using cutover-date FX, inspect residual opening balances, and identify existing ledger records that could block cutover. This preview is read-only.</p>
      </div></div>
      <Button type="button" variant="outline" onClick={() => { setRequested(true); void refetch() }} disabled={isFetching}>
        {isFetching ? <><Loader2 size={15} className="animate-spin" /> Checking…</> : <><RefreshCw size={15} /> {result ? 'Refresh preview' : 'Run reconciliation preview'}</>}
      </Button>
    </div>
    {isError && <Alert variant="destructive" className="mt-4"><AlertDescription>{error?.message || 'Could not build the Finance reconciliation preview.'}</AlertDescription></Alert>}
    {result && <div className="mt-5 space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2"><Badge variant={['RECONCILED_PENDING_CUTOVER', 'CUTOVER_COMPLETED'].includes(result.state) ? 'success' : 'warning'}>{stateLabel}</Badge><span className="text-xs text-muted">Cutover date {result.targetCutoverAt || 'not set'} · amounts in {result.workspaceCurrency}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Eligible AP at cutover FX', result.balances.stagedEligibleApAtCutoverFx], ['Source AP control', result.balances.sourceApControl], ['Open AR at cutover FX', result.balances.stagedArAtCutoverFx], ['Source AR control', result.balances.sourceArControl],
        ].map(([label, value]) => <div key={label} className="rounded-lg border border-border-subtle bg-surface p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-semibold text-heading">{amount(value, result.workspaceCurrency)}</p></div>)}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <span>{result.evidence.eligibleApRows} eligible AP rows</span><span>{result.evidence.pendingApRows} pending AP rows excluded from recognition</span><span>{result.evidence.arRows} AR rows</span><span>{result.evidence.trialBalanceRows} residual trial-balance lines</span><span>{result.evidence.activeJournalCount} existing journals</span>
      </div>
      {result.issues.length > 0 && <div className="rounded-lg border border-warning-border bg-warning-light p-4"><p className="flex items-center gap-2 text-sm font-semibold text-warning-text"><AlertCircle size={16} />Resolve these reconciliation findings</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-warning-text">{result.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul></div>}
      {result.state === 'CUTOVER_COMPLETED' && <Alert variant="success"><AlertDescription><span className="inline-flex items-center gap-2"><CheckCircle2 size={15} />Finance cutover was committed on {result.targetCutoverAt}. The staged rows are retained for audit and can be reviewed from this page.</span></AlertDescription></Alert>}
      {result.state === 'RECONCILED_PENDING_CUTOVER' && <Alert variant="success"><AlertDescription>Staged AP, AR, and residual trial-balance amounts reconcile at the cutover FX basis, and no existing journal or invoice conflict was found. Committing creates the opening journal and linked open invoices in one transaction; imported historical payments are recorded as source totals, not fabricated settlement entries.</AlertDescription></Alert>}
      {cutoverMutation.isError && <Alert variant="destructive"><AlertDescription>{cutoverMutation.error?.message || 'Finance cutover failed. No partial migration should be committed; refresh and review the reconciliation.'}</AlertDescription></Alert>}
      {result.state === 'RECONCILED_PENDING_CUTOVER' && canManage && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-border bg-warning-light p-4"><p className="max-w-xl text-xs leading-5 text-warning-text">This creates operational Finance records and ledger entries. It cannot be undone through the migration screen. Verify the source totals and cutover date before committing.</p><Button type="button" onClick={() => { cutoverMutation.reset(); setConfirmOpen(true) }} disabled={cutoverMutation.isPending}>Commit Finance cutover</Button></div>}
      {result.state === 'RECONCILED_PENDING_CUTOVER' && !canManage && <p className="text-xs leading-5 text-muted">A workspace owner or admin must commit the Finance cutover.</p>}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => cutoverMutation.mutate()}
        title="Commit Finance migration cutover?"
        description="This will create the opening ledger journal, import linked AP and AR invoices, and complete the staged Finance batches. Pending AP remains unrecognized. The operation is atomic and retries are safe, but posted Finance records are not removed if you later change your mind."
        confirmLabel="Commit cutover"
        cancelLabel="Review again"
        busy={cutoverMutation.isPending}
        danger
        error={cutoverMutation.error?.message}
      />
      {result.state !== 'CUTOVER_COMPLETED' && <p className="text-xs leading-5 text-muted">Only staged Finance data shown here is eligible for this cutover. Other company migration areas remain separate work within the same company project.</p>}
    </div>}
    {!result && !isFetching && !isError && <p className="mt-4 text-xs text-muted">Run the preview after staging the AP population, AR population, and opening trial balance.</p>}
  </section>
}
