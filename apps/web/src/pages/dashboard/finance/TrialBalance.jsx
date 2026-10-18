import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Download, Loader2, Plus, Scale, Trash2 } from 'lucide-react'
import { financeApi } from '../../../lib/api/finance'
import { queryKeys } from '../../../lib/queryKeys'
import { formatMoney, formatCompactTableMoney } from '../../../lib/format'
import TopBarActions from '../../../components/TopBarActions'
import FormDialog from '../../../components/common/FormDialog'
import { useActiveMemberRole } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
import { downloadCsv } from '../../../lib/csv'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table'


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
  const canWrite = ['OWNER', 'ADMIN'].includes(getMemberRoleName(activeMemberRole))
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
          <Input aria-label="Trial balance as of date" type="date" value={asOf} onChange={event => setAsOf(event.target.value)} className="h-8 w-auto text-xs" />
        </label>
        {data && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadCsv([
              ['Trial balance', `As of ${data.asOf}`, `Base currency ${data.baseCurrency}`],
              ['Account code', 'Account', 'Kind', 'Native currency', 'Debit', 'Credit', 'Debit base', 'Credit base', 'Net debit base', 'Net credit base'],
              ...data.rows.map(row => [row.accountCode, row.accountName, row.accountKind, row.currency, row.debit.amount, row.credit.amount, row.debitBase.amount, row.creditBase.amount, row.netDebitBase.amount, row.netCreditBase.amount]),
              ['TOTAL', '', '', data.baseCurrency, '', '', data.totalDebitBase.amount, data.totalCreditBase.amount],
            ], `trial-balance-${data.asOf}.csv`)}
            className="gap-2 font-medium"
          >
            <Download size={14} /> Export CSV
          </Button>
        )}
        {data?.rows.length === 0 && canWrite && (
          <Button
            type="button"
            size="sm"
            onClick={() => { openingMutation.reset(); setOpeningOpen(true) }}
            className="gap-2 font-semibold"
          >
            <Plus size={14} /> Record opening balances
          </Button>
        )}
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
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Failed to load the trial balance.</AlertDescription>
        </Alert>
      )}
      {data && <>
        {openingMutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{openingMutation.error?.message || 'Could not record opening balances.'}</AlertDescription>
          </Alert>
        )}
        {!data.isComplete && (
          <Alert className="border-warning/30 bg-warning/5 text-body">
            <AlertDescription>
              This report is incomplete in base currency: {data.unvaluedJournalCount} historic journal {data.unvaluedJournalCount === 1 ? 'entry has' : 'entries have'} no recorded FX basis. These entries are not converted or estimated.
            </AlertDescription>
          </Alert>
        )}
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
          <Table className="w-full min-w-[1050px] text-left text-sm">
            <TableHeader className="border-b border-border-default bg-surface-muted text-xs uppercase tracking-wide text-muted">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="px-4 py-3 text-left rtl:text-right">Account</TableHead>
                <TableHead className="px-4 py-3 text-left rtl:text-right">Kind</TableHead>
                <TableHead className="px-4 py-3 text-left rtl:text-right">Native</TableHead>
                <TableHead className="px-4 py-3 text-right rtl:text-left">Debit</TableHead>
                <TableHead className="px-4 py-3 text-right rtl:text-left">Credit</TableHead>
                <TableHead className="px-4 py-3 text-right rtl:text-left">Net debit ({data.baseCurrency})</TableHead>
                <TableHead className="px-4 py-3 text-right rtl:text-left">Net credit ({data.baseCurrency})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border-default">
              {data.rows.map(row => (
                <TableRow key={row.accountId}>
                  <TableCell className="px-4 py-3"><span className="font-mono text-xs text-muted">{row.accountCode}</span><span className="ml-2 font-medium text-body">{row.accountName}</span></TableCell>
                  <TableCell className="px-4 py-3 text-body">
                    <Badge variant="outline" className="text-xs capitalize font-normal border-border-default">
                      {row.accountKind.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-body">{row.currency}</TableCell>
                  <TableCell className="px-4 py-3 text-right rtl:text-left tabular-nums text-body" title={formatMoney(row.debit)}>{formatCompactTableMoney(row.debit)}</TableCell>
                  <TableCell className="px-4 py-3 text-right rtl:text-left tabular-nums text-body" title={formatMoney(row.credit)}>{formatCompactTableMoney(row.credit)}</TableCell>
                  <TableCell className="px-4 py-3 text-right rtl:text-left tabular-nums text-body" title={formatMoney(row.netDebitBase)}>{formatCompactTableMoney(row.netDebitBase)}</TableCell>
                  <TableCell className="px-4 py-3 text-right rtl:text-left tabular-nums text-body" title={formatMoney(row.netCreditBase)}>{formatCompactTableMoney(row.netCreditBase)}</TableCell>
                </TableRow>
              ))}
              {data.rows.length === 0 && (
                <TableRow className="hover:bg-transparent border-0">
                  <TableCell colSpan={7} className="px-4 py-12 text-center text-muted">No ledger accounts have been recorded.</TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter className="border-t border-border-default bg-surface-muted font-semibold text-heading">
              <TableRow className="hover:bg-transparent border-0">
                <TableCell colSpan={5} className="px-4 py-3">Base currency totals</TableCell>
                <TableCell className="px-4 py-3 text-right rtl:text-left tabular-nums" title={formatMoney(data.totalDebitBase)}>{formatCompactTableMoney(data.totalDebitBase)}</TableCell>
                <TableCell className="px-4 py-3 text-right rtl:text-left tabular-nums" title={formatMoney(data.totalCreditBase)}>{formatCompactTableMoney(data.totalCreditBase)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </>}
      <FormDialog open={openingOpen} onClose={() => setOpeningOpen(false)} title="Record opening balances" subtitle={`Enter the prior balances as of the ledger cutover date. All amounts must use ${data?.baseCurrency || 'workspace base currency'}, and total debits must equal total credits.`} width="max-w-5xl" busy={openingMutation.isPending} confirmLabel="Post opening balances" onConfirm={() => openingMutation.mutate({
        asOf: openingDate,
        description: openingDescription,
        lines: openingLines.map(line => ({ ...line, amount: line.amount.trim() })),
      })}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-body">Cutover date
              <Input aria-label="Opening balance date" type="date" value={openingDate} onChange={event => setOpeningDate(event.target.value)} className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-body">Description
              <Input aria-label="Opening balance description" value={openingDescription} onChange={event => setOpeningDescription(event.target.value)} className="mt-1" maxLength={240} />
            </label>
          </div>
          <p className="text-xs text-muted">Use one line per account. Choose the account’s normal balance side and enter positive amounts. Add an equity line to balance the opening position. This posting is append-only; errors must be corrected with a future reversal workflow.</p>
          <div className="space-y-3">
            {openingLines.map((line, index) => <div key={index} className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border-default p-3 sm:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_auto]">
              <label className="text-xs font-medium text-muted">Account code
                <Input aria-label={`Account code ${index + 1}`} value={line.code} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, code: event.target.value.toUpperCase() } : item))} className="mt-1 text-sm" maxLength={32} />
              </label>
              <label className="text-xs font-medium text-muted">Account name
                <Input aria-label={`Account name ${index + 1}`} value={line.name} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, name: event.target.value } : item))} className="mt-1 text-sm" maxLength={80} />
              </label>
              <label className="text-xs font-medium text-muted">Type<select aria-label={`Account type ${index + 1}`} value={line.kind} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, kind: event.target.value } : item))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-2 py-2 text-sm text-body">{['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'INCOME'].map(kind => <option key={kind} value={kind}>{kind.toLowerCase()}</option>)}</select></label>
              <label className="text-xs font-medium text-muted">Side<select aria-label={`Account side ${index + 1}`} value={line.side} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, side: event.target.value } : item))} className="mt-1 w-full rounded-input border border-border-default bg-surface-raised px-2 py-2 text-sm text-body"><option value="DEBIT">Debit</option><option value="CREDIT">Credit</option></select></label>
              <label className="text-xs font-medium text-muted">Amount ({data?.baseCurrency})
                <Input aria-label={`Opening amount ${index + 1}`} inputMode="decimal" value={line.amount} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, amount: event.target.value } : item))} className="mt-1 text-sm" placeholder="0.00" />
              </label>
              <Button type="button" variant="outline" size="icon" aria-label={`Remove opening account ${index + 1}`} disabled={openingLines.length <= 2} onClick={() => setOpeningLines(current => current.filter((_, row) => row !== index))} className="h-9 w-9 text-danger border-border-default hover:bg-danger-light"><Trash2 size={15} /></Button>
            </div>)}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpeningLines(current => [...current, { code: '', name: '', kind: 'ASSET', side: 'DEBIT', amount: '' }])} className="gap-2"><Plus size={14} /> Add account line</Button>
        </div>
      </FormDialog>
    </div>
  )
}
