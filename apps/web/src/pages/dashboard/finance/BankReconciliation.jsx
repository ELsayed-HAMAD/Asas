import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileSpreadsheet, FileUp, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import QueryState from '../../../components/common/QueryState'
import { financeApi } from '../../../lib/api/finance'
import { queryKeys } from '../../../lib/queryKeys'
import { parseBankStatementCsv } from '../../../lib/bankStatementCsv'
import { formatCompactTableMoney } from '../../../lib/format'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import {
  Table,
  TableHeader,
  TableBody,
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

function formatCalendarDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString()
}

export default function BankReconciliation() {
  const queryClient = useQueryClient()
  const [selectedFile, setSelectedFile] = useState(null)
  const [parsedRows, setParsedRows] = useState(null)
  const [error, setError] = useState('')
  const [selectedImportId, setSelectedImportId] = useState('')
  const [dragActive, setDragActive] = useState(false)

  const importsQuery = useQuery({
    queryKey: [...queryKeys.finance.all(), 'bank-statements'],
    queryFn: financeApi.listBankStatementImports,
  })
  const imports = importsQuery.data?.items ?? []
  const currentImportId = selectedImportId || imports[0]?.id || ''
  const detailQuery = useQuery({
    queryKey: [...queryKeys.finance.all(), 'bank-statement', currentImportId],
    queryFn: () => financeApi.getBankStatementImport(currentImportId),
    enabled: Boolean(currentImportId),
  })
  const currentImport = detailQuery.data
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...queryKeys.finance.all(), 'bank-statements'] })

  const importMutation = useMutation({
    mutationFn: financeApi.importBankStatement,
    onSuccess: result => {
      setSelectedImportId(result.id)
      setParsedRows(null)
      setSelectedFile(null)
      setError('')
      invalidate()
    },
    onError: err => setError(err?.message || 'Statement import failed.'),
  })

  const matchMutation = useMutation({
    mutationFn: ({ id, lineId, journalLineId }) => financeApi.matchBankStatementLine(id, lineId, journalLineId),
    onSuccess: () => invalidate(),
    onError: err => setError(err?.message || 'Could not reconcile this statement line.'),
  })

  const unmatchMutation = useMutation({
    mutationFn: ({ id, lineId }) => financeApi.unmatchBankStatementLine(id, lineId),
    onSuccess: () => invalidate(),
    onError: err => setError(err?.message || 'Could not undo this match.'),
  })

  const summary = useMemo(() => ({
    lines: currentImport?.lineCount ?? 0,
    matched: currentImport?.matchedCount ?? 0,
  }), [currentImport])

  async function chooseFile(file) {
    setSelectedFile(file)
    setParsedRows(null)
    setError('')
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Choose a CSV file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Statement CSV files are limited to 2 MiB.')
      return
    }
    try {
      setParsedRows(parseBankStatementCsv(await file.text()))
    } catch (err) {
      setError(err.message)
    }
  }

  function handleDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      chooseFile(e.dataTransfer.files[0])
    }
  }

  function importStatement() {
    if (!selectedFile || !parsedRows) return
    importMutation.mutate({ fileName: selectedFile.name, rows: parsedRows })
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-surface">
      <TopBarActions><div /></TopBarActions>
      <section className="flex-1 overflow-y-auto p-5 lg:p-6">
        <div className="mx-auto max-w-[1600px] space-y-4">
          {/* Top Workspace Header (Apple-Glass Banner) */}
          <header className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-200/60 mb-1.5">
                FINANCE
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Bank reconciliation
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">
                Import a normalized CSV statement and review exact matches against recorded cash settlements. Imports never create or change ledger entries; every match is confirmed manually.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="bg-slate-100/80 border border-slate-200/70 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Manual confirmation safety</span>
              </div>
            </div>
          </header>

          {/* Import a Statement Card — 12-Column Workbench Layout */}
          <section className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] space-y-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0">
                  <FileUp size={18} />
                </div>
                <h2 className="text-base font-bold text-slate-900">Import a statement</h2>
              </div>
              <span className="text-[11px] font-medium text-slate-400">CSV · Max 2 MiB</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Left Column (lg:col-span-7) — Interactive Tactile CSV Dropzone */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <label
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`h-full min-h-[148px] rounded-2xl ${
                    dragActive
                      ? 'bg-indigo-50/50 border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'bg-slate-50/70 hover:bg-indigo-50/30 border-slate-200/90 hover:border-indigo-400/80'
                  } border-2 border-dashed transition-all duration-200 p-6 flex flex-col items-center justify-center text-center gap-2.5 cursor-pointer group`}
                >
                  <div className="w-11 h-11 rounded-2xl bg-white border border-slate-200/80 shadow-sm group-hover:scale-105 group-hover:border-indigo-200 flex items-center justify-center text-indigo-600 transition-all">
                    <Upload size={20} />
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">
                    {selectedFile ? selectedFile.name : 'Choose statement CSV (2 MiB max)'}
                  </span>
                  <input
                    className="sr-only"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={event => chooseFile(event.target.files?.[0] ?? null)}
                  />
                </label>

                {parsedRows && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm rounded-xl bg-indigo-50/60 border border-indigo-100 p-3">
                    <span className="text-xs sm:text-sm font-medium text-indigo-900">
                      {parsedRows.length} rows validated and ready to import
                    </span>
                    <Button
                      type="button"
                      onClick={importStatement}
                      disabled={importMutation.isPending}
                      size="sm"
                      className="font-semibold h-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                    >
                      {importMutation.isPending ? 'Importing…' : 'Import statement'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Right Column (lg:col-span-5) — Recessed CSV Format Specification Well */}
              <div className="lg:col-span-5 flex flex-col justify-between bg-slate-50/90 border border-slate-200/70 rounded-2xl p-4 gap-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Required columns: Date, Description, Currency, Amount (signed from the bank account's point of view). Reference is optional. Use YYYY-MM-DD dates and quote CSV values that contain commas.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200/60">
                  <span className="px-2 py-1 rounded-lg bg-white border border-slate-200/80 text-[11px] font-mono font-medium text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    Date (YYYY-MM-DD)
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-white border border-slate-200/80 text-[11px] font-mono font-medium text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    Description
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-white border border-slate-200/80 text-[11px] font-mono font-medium text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    Currency
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-white border border-slate-200/80 text-[11px] font-mono font-medium text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    Amount (±)
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-white border border-slate-200/80 text-[11px] font-mono font-medium text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    Reference (Opt)
                  </span>
                </div>
              </div>
            </div>
          </section>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Bottom Section: Reconciliation Workspace Queue / Empty State */}
          <QueryState
            isLoading={importsQuery.isLoading}
            isError={importsQuery.isError}
            error={importsQuery.error}
          >
            {imports.length === 0 ? (
              <section className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05)] overflow-hidden">
                <div className="bg-slate-50/90 border-b border-slate-200/70 px-5 py-2.5 grid grid-cols-5 gap-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <div>Date</div>
                  <div>Description</div>
                  <div>Currency</div>
                  <div>Amount</div>
                  <div>Match Status</div>
                </div>
                <div className="p-6">
                  <div className="bg-slate-50/60 border border-dashed border-slate-200/80 rounded-xl py-10 px-4 flex flex-col items-center justify-center text-center gap-2">
                    <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-400 mb-1">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">No statement imports yet</h3>
                    <p className="text-xs text-slate-500">Choose a CSV statement above to begin reconciliation.</p>
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)]">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Statement import</label>
                    <Select value={currentImportId} onValueChange={val => setSelectedImportId(val)}>
                      <SelectTrigger className="min-w-64 bg-white/90 border-slate-200/80 rounded-xl text-xs sm:text-sm h-9">
                        <SelectValue placeholder="Select statement import" />
                      </SelectTrigger>
                      <SelectContent>
                        {imports.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.fileName} · {new Date(item.createdAt).toLocaleDateString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200/70 text-xs font-semibold text-slate-700">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{summary.matched} of {summary.lines} rows reconciled</span>
                  </div>
                </section>

                <QueryState
                  isLoading={detailQuery.isLoading}
                  isError={detailQuery.isError}
                  error={detailQuery.error}
                  isEmpty={!currentImport?.lines?.length}
                  emptyTitle="This statement has no rows"
                  emptyDescription="Import another CSV to continue."
                >
                  {currentImport?.lines?.length > 0 && (
                    <section className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05)]">
                      <Table className="w-full min-w-[900px] border-collapse text-left text-sm">
                        <TableHeader className="bg-slate-50/90 border-b border-slate-200/70 text-xs uppercase text-slate-500">
                          <TableRow className="hover:bg-transparent border-0">
                            <TableHead className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-right">Statement row</TableHead>
                            <TableHead className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-right">Amount</TableHead>
                            <TableHead className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-right">Suggested ledger match</TableHead>
                            <TableHead className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 rtl:text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-slate-100">
                          {currentImport.lines.map(line => (
                            <TableRow key={line.id} className="hover:bg-slate-50/60 transition-colors">
                              <TableCell className="max-w-sm px-5 py-3.5">
                                <p className="font-semibold text-slate-900">{line.description}</p>
                                <p className="mt-0.5 text-xs text-slate-400 font-mono">
                                  {formatCalendarDate(line.postedAt)}
                                  {line.reference ? ` · ${line.reference}` : ''}
                                </p>
                              </TableCell>
                              <TableCell className="px-5 py-3.5 font-mono font-medium text-slate-900 tabular-nums" title={`${line.amount} ${line.currency}`}>
                                {formatCompactTableMoney(line.amount, { currency: line.currency })}
                              </TableCell>
                              <TableCell className="px-5 py-3.5">
                                {line.matchedLedgerLine ? (
                                  <div className="text-xs text-slate-700">
                                    <Badge variant="outline" className="inline-flex items-center gap-1 font-semibold text-emerald-700 border border-emerald-200/80 bg-emerald-50">
                                      <Check size={13} /> Reconciled
                                    </Badge>
                                    <p className="mt-1 font-medium text-slate-800">{line.matchedLedgerLine.description}</p>
                                    <p className="mt-0.5 text-slate-400 text-[11px]">
                                      {line.matchedLedgerLine.sourceType} · {line.matchedLedgerLine.signedAmount} {line.matchedLedgerLine.currency} · {line.matchedLedgerLine.daysApart} day(s) apart
                                    </p>
                                  </div>
                                ) : line.suggestedMatches.length ? (
                                  <div className="space-y-2">
                                    {line.suggestedMatches.slice(0, 3).map(candidate => (
                                      <div key={candidate.journalLineId} className="text-xs text-slate-700 bg-slate-50/80 border border-slate-200/60 rounded-lg p-2">
                                        <p className="font-medium text-slate-800">{candidate.description}</p>
                                        <p className="mt-0.5 text-slate-400 text-[11px]">
                                          {candidate.sourceType} · {candidate.signedAmount} {candidate.currency} · {candidate.daysApart} day(s) apart
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">No exact match found</span>
                                )}
                              </TableCell>
                              <TableCell className="px-5 py-3.5">
                                {line.matchedJournalLineId ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => unmatchMutation.mutate({ id: currentImport.id, lineId: line.id })}
                                    disabled={unmatchMutation.isPending}
                                    className="gap-1 h-7 px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 border-slate-200 shadow-sm"
                                  >
                                    <RotateCcw size={13} /> Undo
                                  </Button>
                                ) : (
                                  line.suggestedMatches.length > 0 && (
                                    <Select
                                      onValueChange={val => {
                                        if (val) matchMutation.mutate({ id: currentImport.id, lineId: line.id, journalLineId: val })
                                      }}
                                      disabled={matchMutation.isPending}
                                    >
                                      <SelectTrigger
                                        aria-label={`Match ${line.description}`}
                                        className="max-w-44 h-8 bg-white/90 border-slate-200/80 rounded-xl text-xs"
                                      >
                                        <SelectValue placeholder="Select candidate…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {line.suggestedMatches.map(candidate => (
                                          <SelectItem key={candidate.journalLineId} value={candidate.journalLineId} className="text-xs">
                                            {candidate.signedAmount} {candidate.currency} · {candidate.daysApart}d
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </section>
                  )}
                </QueryState>
              </>
            )}
          </QueryState>
        </div>
      </section>
    </div>
  )
}
