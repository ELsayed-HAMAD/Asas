import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Download, Loader2, Plus, Scale, Trash2 } from 'lucide-react'
import { financeApi } from '../../../lib/api/finance'
import { queryKeys } from '../../../lib/queryKeys'
import { formatMoney } from '../../../lib/format'
import TopBarActions from '../../../components/TopBarActions'
import FormDialog from '../../../components/common/FormDialog'
import { useActiveMemberRole } from '../../../lib/authClient'
import { downloadCsv } from '../../../lib/csv'


const EMPTY_OPENING_LINES = [
  { code: 'CASH', name: 'Cash', kind: 'ASSET', side: 'DEBIT', amount: '' },
  { code: 'OPENING_EQUITY', name: 'Opening balance equity', kind: 'EQUITY', side: 'CREDIT', amount: '' },
]

export default function TrialBalance() {
  const queryClient = useQueryClient()
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [openingOpen, setOpeningOpen] = useState(false)
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10))
  const [openingDescription, setOpeningDescription] = useState('Opening balances')
  const [openingLines, setOpeningLines] = useState(EMPTY_OPENING_LINES)
  const { data: activeMemberRole } = useActiveMemberRole()
  const canWrite = ['OWNER', 'ADMIN'].includes(activeMemberRole?.role)
  const openingMutation = useMutation({
    mutationFn: financeApi.createOpeningBalance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() })
      setOpeningOpen(false)
      setOpeningLines(EMPTY_OPENING_LINES)
      setOpeningDescription('Opening balances')
    },
  })
  const { data, isLoading, isError } = useQuery({
    queryKey: [...queryKeys.finance.all(), 'trial-balance', asOf],
    queryFn: () => financeApi.getTrialBalance(asOf),
  })

  return (
    <div className="flex h-full min-w-0 flex-col gap-5 overflow-auto bg-surface p-6">
      <TopBarActions>
        <label className="flex items-center gap-2 text-sm text-body">
          <span>As of</span>
          <input aria-label="Trial balance as of date" type="date" value={asOf} onChange={event => setAsOf(event.target.value)} className="rounded-input border border-border-default bg-surface px-2 py-1.5" />
        </label>
        {data && <button type="button" onClick={() => downloadCsv([
          ['Trial balance', `As of ${data.asOf}`, `Base currency ${data.baseCurrency}`],
          ['Account code', 'Account', 'Kind', 'Native currency', 'Debit', 'Credit', 'Debit base', 'Credit base', 'Net debit base', 'Net credit base'],
          ...data.rows.map(row => [row.accountCode, row.accountName, row.accountKind, row.currency, row.debit.amount, row.credit.amount, row.debitBase.amount, row.creditBase.amount, row.netDebitBase.amount, row.netCreditBase.amount]),
          ['TOTAL', '', '', data.baseCurrency, '', '', data.totalDebitBase.amount, data.totalCreditBase.amount],
        ], `trial-balance-${data.asOf}.csv`)} className="inline-flex items-center gap-2 rounded-input border border-border-default px-3 py-1.5 text-sm font-medium text-body hover:bg-surface-muted">
          <Download size={14} /> Export CSV
        </button>}
        {data?.rows.length === 0 && canWrite && <button type="button" onClick={() => { openingMutation.reset(); setOpeningOpen(true) }} className="inline-flex items-center gap-2 rounded-input bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary hover:bg-primary-hover">
          <Plus size={14} /> Record opening balances
        </button>}
      </TopBarActions>

      <header>
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-accent/10 p-2 text-accent"><Scale size={20} /></span>
          <div>
            <h1 className="text-xl font-semibold text-heading">Trial balance</h1>
            <p className="text-sm text-muted">Posted journal balances through the selected date, shown in workspace base currency. Opening balances must be recorded before the first ledger journal.</p>
          </div>
        </div>
      </header>

      {isLoading && <div className="flex flex-1 items-center justify-center"><Loader2 className="animate-spin text-muted" size={24} /></div>}
      {isError && <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">Failed to load the trial balance.</div>}
      {data && <>
        {openingMutation.isError && <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{openingMutation.error?.message || 'Could not record opening balances.'}</div>}
        {!data.isComplete && <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-body">
          This report is incomplete in base currency: {data.unvaluedJournalCount} historic journal {data.unvaluedJournalCount === 1 ? 'entry has' : 'entries have'} no recorded FX basis. These entries are not converted or estimated.
        </div>}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border-default bg-surface-raised p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Base currency</p>
            <p className="mt-2 text-xl font-semibold text-heading">{data.baseCurrency}</p>
          </div>
          <div className="rounded-xl border border-border-default bg-surface-raised p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Total debits</p>
            <p className="mt-2 text-xl font-semibold text-heading">{formatMoney(data.totalDebitBase)}</p>
          </div>
          <div className="rounded-xl border border-border-default bg-surface-raised p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Total credits</p>
            <p className="mt-2 text-xl font-semibold text-heading">{formatMoney(data.totalCreditBase)}</p>
          </div>
        </section>
        <div className="overflow-x-auto rounded-xl border border-border-default bg-surface-raised">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-border-default bg-surface-muted text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Kind</th><th className="px-4 py-3">Native</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th><th className="px-4 py-3 text-right">Net debit ({data.baseCurrency})</th><th className="px-4 py-3 text-right">Net credit ({data.baseCurrency})</th></tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {data.rows.map(row => <tr key={row.accountId}>
                <td className="px-4 py-3"><span className="font-mono text-xs text-muted">{row.accountCode}</span><span className="ml-2 font-medium text-body">{row.accountName}</span></td>
                <td className="px-4 py-3 text-body">{row.accountKind.toLowerCase()}</td>
                <td className="px-4 py-3 text-body">{row.currency}</td>
                <td className="px-4 py-3 text-right tabular-nums text-body">{formatMoney(row.debit)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-body">{formatMoney(row.credit)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-body">{formatMoney(row.netDebitBase)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-body">{formatMoney(row.netCreditBase)}</td>
              </tr>)}
              {data.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted">No ledger accounts have been recorded.</td></tr>}
            </tbody>
            <tfoot className="border-t border-border-default bg-surface-muted font-semibold text-heading">
              <tr><td colSpan={5} className="px-4 py-3">Base currency totals</td><td className="px-4 py-3 text-right tabular-nums">{formatMoney(data.totalDebitBase)}</td><td className="px-4 py-3 text-right tabular-nums">{formatMoney(data.totalCreditBase)}</td></tr>
            </tfoot>
          </table>
        </div>
      </>}
      <FormDialog open={openingOpen} onClose={() => setOpeningOpen(false)} title="Record opening balances" subtitle={`Enter the prior balances as of the ledger cutover date. All amounts must use ${data?.baseCurrency || 'workspace base currency'}, and total debits must equal total credits.`} width="max-w-5xl" busy={openingMutation.isPending} confirmLabel="Post opening balances" onConfirm={() => openingMutation.mutate({
        asOf: openingDate,
        description: openingDescription,
        lines: openingLines.map(line => ({ ...line, amount: line.amount.trim() })),
      })}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-body">Cutover date<input aria-label="Opening balance date" type="date" value={openingDate} onChange={event => setOpeningDate(event.target.value)} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-3 py-2" /></label>
            <label className="block text-sm font-medium text-body">Description<input aria-label="Opening balance description" value={openingDescription} onChange={event => setOpeningDescription(event.target.value)} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-3 py-2" maxLength={240} /></label>
          </div>
          <p className="text-xs text-muted">Use one line per account. Choose the account’s normal balance side and enter positive amounts. Add an equity line to balance the opening position. This posting is append-only; errors must be corrected with a future reversal workflow.</p>
          <div className="space-y-3">
            {openingLines.map((line, index) => <div key={index} className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border-default p-3 sm:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_auto]">
              <label className="text-xs font-medium text-muted">Account code<input aria-label={`Account code ${index + 1}`} value={line.code} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, code: event.target.value.toUpperCase() } : item))} className="mt-1 w-full rounded-input border border-border-default px-2 py-2 text-sm text-body" maxLength={32} /></label>
              <label className="text-xs font-medium text-muted">Account name<input aria-label={`Account name ${index + 1}`} value={line.name} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, name: event.target.value } : item))} className="mt-1 w-full rounded-input border border-border-default px-2 py-2 text-sm text-body" maxLength={80} /></label>
              <label className="text-xs font-medium text-muted">Type<select aria-label={`Account type ${index + 1}`} value={line.kind} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, kind: event.target.value } : item))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-2 py-2 text-sm text-body">{['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'INCOME'].map(kind => <option key={kind} value={kind}>{kind.toLowerCase()}</option>)}</select></label>
              <label className="text-xs font-medium text-muted">Side<select aria-label={`Account side ${index + 1}`} value={line.side} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, side: event.target.value } : item))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-2 py-2 text-sm text-body"><option value="DEBIT">Debit</option><option value="CREDIT">Credit</option></select></label>
              <label className="text-xs font-medium text-muted">Amount ({data?.baseCurrency})<input aria-label={`Opening amount ${index + 1}`} inputMode="decimal" value={line.amount} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, amount: event.target.value } : item))} className="mt-1 w-full rounded-input border border-border-default px-2 py-2 text-sm text-body" placeholder="0.00" /></label>
              <button type="button" aria-label={`Remove opening account ${index + 1}`} disabled={openingLines.length <= 2} onClick={() => setOpeningLines(current => current.filter((_, row) => row !== index))} className="rounded-input border border-border-default p-2 text-danger disabled:opacity-40"><Trash2 size={15} /></button>
            </div>)}
          </div>
          <button type="button" onClick={() => setOpeningLines(current => [...current, { code: '', name: '', kind: 'ASSET', side: 'DEBIT', amount: '' }])} className="inline-flex items-center gap-2 rounded-input border border-border-default px-3 py-2 text-sm font-medium text-body hover:bg-surface-muted"><Plus size={14} /> Add account line</button>
        </div>
      </FormDialog>
    </div>
  )
}
