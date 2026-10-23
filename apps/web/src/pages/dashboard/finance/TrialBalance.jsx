import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Coins, Download, Loader2, Plus, Scale, Trash2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'

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

  const totalDebits = data?.totalDebitBase?.amount ?? '0'
  const totalCredits = data?.totalCreditBase?.amount ?? '0'
  const isBalanced = Number(totalDebits) === Number(totalCredits)

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-surface">
      {/* Kept empty to clear the top global bar and avoid breadcrumb clipping */}
      <TopBarActions><div /></TopBarActions>

      <section className="flex-1 overflow-y-auto p-5 lg:p-6">
        <div className="mx-auto max-w-[1600px] space-y-4">
          {/* Unified Apple-Glass Header & Action Bar Card */}
          <header className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <Scale size={20} />
              </span>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900">Trial balance</h1>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5 max-w-2xl">
                  Posted journal balances through the selected date, shown in workspace base currency. Opening balances must be recorded before the first ledger journal.
                </p>
              </div>
            </div>

            {/* Relocated Action Toolbar Controls */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">As of</span>
                <Input
                  aria-label="Trial balance as of date"
                  type="date"
                  value={asOf}
                  onChange={event => setAsOf(event.target.value)}
                  className="h-9 px-3 rounded-xl bg-slate-100/80 border border-slate-200/70 text-xs sm:text-sm font-medium text-slate-700 w-auto shadow-none focus-visible:ring-1"
                />
              </div>

              {data && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => downloadCsv([
                    ['Trial balance', `As of ${data.asOf}`, `Base currency ${data.baseCurrency}`],
                    ['Account code', 'Account', 'Kind', 'Native currency', 'Debit', 'Credit', 'Debit base', 'Credit base', 'Net debit base', 'Net credit base'],
                    ...data.rows.map(row => [row.accountCode, row.accountName, row.accountKind, row.currency, row.debit.amount, row.credit.amount, row.debitBase.amount, row.creditBase.amount, row.netDebitBase.amount, row.netCreditBase.amount]),
                    ['TOTAL', '', '', data.baseCurrency, '', '', data.totalDebitBase.amount, data.totalCreditBase.amount],
                  ], `trial-balance-${data.asOf}.csv`)}
                  className="h-9 px-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/90 shadow-sm text-xs sm:text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-all"
                >
                  <Download size={14} /> Export CSV
                </Button>
              )}

              {data?.rows.length === 0 && canWrite && (
                <Button
                  type="button"
                  onClick={() => { openingMutation.reset(); setOpeningOpen(true) }}
                  className="h-9 px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap bg-slate-900 hover:bg-slate-800 text-white transition-all"
                >
                  <Plus size={14} /> Record opening balances
                </Button>
              )}
            </div>
          </header>

          {isLoading && (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="animate-spin text-slate-400" size={24} />
            </div>
          )}

          {isError && (
            <Alert variant="destructive" className="rounded-2xl">
              <AlertDescription>Failed to load the trial balance.</AlertDescription>
            </Alert>
          )}

          {data && (
            <>
              {openingMutation.isError && (
                <Alert variant="destructive" className="rounded-2xl">
                  <AlertDescription>{openingMutation.error?.message || 'Could not record opening balances.'}</AlertDescription>
                </Alert>
              )}

              {!data.isComplete && (
                <Alert className="rounded-2xl border-amber-200 bg-amber-50/80 text-amber-900">
                  <AlertDescription className="text-xs sm:text-sm">
                    This report is incomplete in base currency: {data.unvaluedJournalCount} historic journal {data.unvaluedJournalCount === 1 ? 'entry has' : 'entries have'} no recorded FX basis. These entries are not converted or estimated.
                  </AlertDescription>
                </Alert>
              )}

              {/* Row 1: 3-Tier Apple-Glass KPI Cards */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Card 1: Base Currency */}
                <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[118px]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Base currency</p>
                    <span className="w-8 h-8 rounded-xl bg-slate-900/5 border border-slate-900/10 text-slate-700 flex items-center justify-center">
                      <Coins size={16} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 my-1">
                    <p className="text-2xl font-bold tracking-tight text-slate-900">{data.baseCurrency}</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                      Workspace Default
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200/70" />
                </div>

                {/* Card 2: Total Debits */}
                <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[118px]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total debits</p>
                    <span className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center">
                      <ArrowDownLeft size={16} />
                    </span>
                  </div>
                  <p className="text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums my-1">
                    {formatMoney(data.totalDebitBase)}
                  </p>
                  <div className="h-1.5 w-full rounded-full bg-indigo-100/80" />
                </div>

                {/* Card 3: Total Credits */}
                <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col justify-between min-h-[118px]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total credits</p>
                    <span className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center">
                      <ArrowUpRight size={16} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 my-1">
                    <p className="text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                      {formatMoney(data.totalCreditBase)}
                    </p>
                    {isBalanced ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                        Balanced
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200/60">
                        Unbalanced
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-emerald-100/80" />
                </div>
              </section>

              {/* Row 2: Trial Balance Table (Unclamped, Full-Width, No Scrollbar) */}
              <section className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05)] overflow-hidden">
                <Table className="w-full table-auto border-collapse text-left text-sm">
                  <TableHeader className="bg-slate-50/90 border-b border-slate-200/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <TableRow className="hover:bg-transparent border-0">
                      <TableHead className="px-3.5 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-right">
                        Account
                      </TableHead>
                      <TableHead className="px-3.5 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-right">
                        Kind
                      </TableHead>
                      <TableHead className="px-3.5 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-right">
                        Native
                      </TableHead>
                      <TableHead className="px-3.5 py-2.5 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-left">
                        Debit
                      </TableHead>
                      <TableHead className="px-3.5 py-2.5 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-left">
                        Credit
                      </TableHead>
                      <TableHead className="px-3.5 py-2.5 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-left">
                        Net debit ({data.baseCurrency})
                      </TableHead>
                      <TableHead className="px-3.5 py-2.5 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-left">
                        Net credit ({data.baseCurrency})
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {data.rows.map(row => (
                      <TableRow key={row.accountId} className="hover:bg-slate-50/60 transition-colors">
                        <TableCell className="px-3.5 py-2.5 text-left whitespace-nowrap">
                          <span className="font-mono text-xs font-semibold text-slate-400">{row.accountCode}</span>
                          <span className="ml-2 font-medium text-slate-900">{row.accountName}</span>
                        </TableCell>
                        <TableCell className="px-3.5 py-2.5 text-left whitespace-nowrap">
                          <Badge variant="outline" className="text-[11px] capitalize font-medium border-slate-200/80 bg-slate-50 text-slate-600">
                            {row.accountKind.toLowerCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-3.5 py-2.5 text-left whitespace-nowrap text-xs font-medium text-slate-600">
                          {row.currency}
                        </TableCell>
                        <TableCell className="px-3.5 py-2.5 text-right rtl:text-left tabular-nums font-mono text-xs text-slate-700 whitespace-nowrap" title={formatMoney(row.debit)}>
                          {formatCompactTableMoney(row.debit)}
                        </TableCell>
                        <TableCell className="px-3.5 py-2.5 text-right rtl:text-left tabular-nums font-mono text-xs text-slate-700 whitespace-nowrap" title={formatMoney(row.credit)}>
                          {formatCompactTableMoney(row.credit)}
                        </TableCell>
                        <TableCell className="px-3.5 py-2.5 text-right rtl:text-left tabular-nums font-mono text-xs font-medium text-slate-900 whitespace-nowrap" title={formatMoney(row.netDebitBase)}>
                          {formatCompactTableMoney(row.netDebitBase)}
                        </TableCell>
                        <TableCell className="px-3.5 py-2.5 text-right rtl:text-left tabular-nums font-mono text-xs font-medium text-slate-900 whitespace-nowrap" title={formatMoney(row.netCreditBase)}>
                          {formatCompactTableMoney(row.netCreditBase)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.rows.length === 0 && (
                      <TableRow className="hover:bg-transparent border-0">
                        <TableCell colSpan={7} className="p-5">
                          <div className="bg-slate-50/60 border border-dashed border-slate-200/80 rounded-xl py-8 px-4 text-center text-xs font-medium text-slate-500">
                            No ledger accounts have been recorded.
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  <TableFooter className="border-t border-slate-200/80 bg-slate-100/85 font-semibold text-slate-900">
                    <TableRow className="hover:bg-transparent border-0">
                      <TableCell colSpan={5} className="px-3.5 py-3 text-xs sm:text-sm font-bold text-slate-900">
                        Base currency totals
                      </TableCell>
                      <TableCell className="px-3.5 py-3 text-right rtl:text-left tabular-nums font-mono text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap" title={formatMoney(data.totalDebitBase)}>
                        {formatCompactTableMoney(data.totalDebitBase)}
                      </TableCell>
                      <TableCell className="px-3.5 py-3 text-right rtl:text-left tabular-nums font-mono text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap" title={formatMoney(data.totalCreditBase)}>
                        {formatCompactTableMoney(data.totalCreditBase)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </section>
            </>
          )}

          {/* Opening Balances Form Dialog */}
          <FormDialog
            open={openingOpen}
            onClose={() => setOpeningOpen(false)}
            title="Record opening balances"
            subtitle={`Enter the prior balances as of the ledger cutover date. All amounts must use ${data?.baseCurrency || 'workspace base currency'}, and total debits must equal total credits.`}
            width="max-w-5xl"
            busy={openingMutation.isPending}
            confirmLabel="Post opening balances"
            onConfirm={() => openingMutation.mutate({
              asOf: openingDate,
              description: openingDescription,
              lines: openingLines.map(line => ({ ...line, amount: line.amount.trim() })),
            })}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-body">
                  Cutover date
                  <Input aria-label="Opening balance date" type="date" value={openingDate} onChange={event => setOpeningDate(event.target.value)} className="mt-1" />
                </label>
                <label className="block text-sm font-medium text-body">
                  Description
                  <Input aria-label="Opening balance description" value={openingDescription} onChange={event => setOpeningDescription(event.target.value)} className="mt-1" maxLength={240} />
                </label>
              </div>
              <p className="text-xs text-muted">
                Use one line per account. Choose the account’s normal balance side and enter positive amounts. Add an equity line to balance the opening position. This posting is append-only; errors must be corrected with a future reversal workflow.
              </p>
              <div className="space-y-3">
                {openingLines.map((line, index) => (
                  <div key={index} className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border-default p-3 sm:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_auto]">
                    <label className="text-xs font-medium text-muted">
                      Account code
                      <Input aria-label={`Account code ${index + 1}`} value={line.code} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, code: event.target.value.toUpperCase() } : item))} className="mt-1 text-sm" maxLength={32} />
                    </label>
                    <label className="text-xs font-medium text-muted">
                      Account name
                      <Input aria-label={`Account name ${index + 1}`} value={line.name} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, name: event.target.value } : item))} className="mt-1 text-sm" maxLength={80} />
                    </label>
                    <div>
                      <label className="text-xs font-medium text-muted block mb-1">Type</label>
                      <Select
                        value={line.kind}
                        onValueChange={val => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, kind: val } : item))}
                      >
                        <SelectTrigger aria-label={`Account type ${index + 1}`} className="w-full h-9 bg-surface-raised text-sm text-body">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'INCOME'].map(kind => (
                            <SelectItem key={kind} value={kind} className="text-sm">
                              {kind.toLowerCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted block mb-1">Side</label>
                      <Select
                        value={line.side}
                        onValueChange={val => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, side: val } : item))}
                      >
                        <SelectTrigger aria-label={`Account side ${index + 1}`} className="w-full h-9 bg-surface-raised text-sm text-body">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DEBIT" className="text-sm">Debit</SelectItem>
                          <SelectItem value="CREDIT" className="text-sm">Credit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="text-xs font-medium text-muted">
                      Amount ({data?.baseCurrency})
                      <Input aria-label={`Opening amount ${index + 1}`} inputMode="decimal" value={line.amount} onChange={event => setOpeningLines(current => current.map((item, row) => row === index ? { ...item, amount: event.target.value } : item))} className="mt-1 text-sm" placeholder="0.00" />
                    </label>
                    <Button type="button" variant="outline" size="icon" aria-label={`Remove opening account ${index + 1}`} disabled={openingLines.length <= 2} onClick={() => setOpeningLines(current => current.filter((_, row) => row !== index))} className="h-9 w-9 text-danger border-border-default hover:bg-danger-light">
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpeningLines(current => [...current, { code: '', name: '', kind: 'ASSET', side: 'DEBIT', amount: '' }])} className="gap-2">
                <Plus size={14} /> Add account line
              </Button>
            </div>
          </FormDialog>
        </div>
      </section>
    </div>
  )
}
