import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileUp, RotateCcw, Upload } from 'lucide-react'
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
  const importsQuery = useQuery({ queryKey: [...queryKeys.finance.all(), 'bank-statements'], queryFn: financeApi.listBankStatementImports })
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
    onSuccess: result => { setSelectedImportId(result.id); setParsedRows(null); setSelectedFile(null); setError(''); invalidate() },
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
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Choose a CSV file.'); return }
    if (file.size > 2 * 1024 * 1024) { setError('Statement CSV files are limited to 2 MiB.'); return }
    try { setParsedRows(parseBankStatementCsv(await file.text())) } catch (err) { setError(err.message) }
  }

  function importStatement() {
    if (!selectedFile || !parsedRows) return
    importMutation.mutate({ fileName: selectedFile.name, rows: parsedRows })
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-surface">
      <TopBarActions><div /></TopBarActions>
      <section className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Finance</p>
            <h1 className="mt-2 text-2xl font-bold text-heading">Bank reconciliation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-body-light">Import a normalized CSV statement and review exact matches against recorded cash settlements. Imports never create or change ledger entries; every match is confirmed manually.</p>
          </header>

          <section className="rounded-card border border-border-default bg-surface-raised p-5 shadow-card">
            <div className="flex items-center gap-2"><FileUp size={18} className="text-accent" /><h2 className="text-lg font-bold text-heading">Import a statement</h2></div>
            <p className="mt-2 text-sm text-body-light">Required columns: Date, Description, Currency, Amount (signed from the bank account’s point of view). Reference is optional. Use YYYY-MM-DD dates and quote CSV values that contain commas.</p>
            <label className="mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-card-sm border border-dashed border-border-default bg-surface px-4 py-5 text-sm text-body-light hover:bg-surface-muted">
              <Upload size={18} className="text-accent" />
              <span>{selectedFile ? selectedFile.name : 'Choose statement CSV (2 MiB max)'}</span>
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={event => chooseFile(event.target.files?.[0] ?? null)} />
            </label>
            {parsedRows && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-body">{parsedRows.length} rows validated and ready to import</span>
                <Button type="button" onClick={importStatement} disabled={importMutation.isPending} size="sm" className="font-semibold">
                  {importMutation.isPending ? 'Importing…' : 'Import statement'}
                </Button>
              </div>
            )}
          </section>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <QueryState isLoading={importsQuery.isLoading} isError={importsQuery.isError} error={importsQuery.error} isEmpty={imports.length === 0} emptyTitle="No statement imports yet" emptyDescription="Choose a CSV statement above to begin reconciliation.">
            {imports.length > 0 && <>
              <section className="flex flex-wrap items-end justify-between gap-3 rounded-card border border-border-default bg-surface-raised p-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-heading">Statement import</label>
                  <Select value={currentImportId} onValueChange={val => setSelectedImportId(val)}>
                    <SelectTrigger className="min-w-64 bg-surface text-sm">
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
                <p className="text-sm text-body-light">{summary.matched} of {summary.lines} rows reconciled</p>
              </section>
              <QueryState isLoading={detailQuery.isLoading} isError={detailQuery.isError} error={detailQuery.error} isEmpty={!currentImport?.lines?.length} emptyTitle="This statement has no rows" emptyDescription="Import another CSV to continue.">
                {currentImport?.lines?.length > 0 && <section className="overflow-x-auto rounded-card border border-border-default bg-surface-raised shadow-card">
                  <Table className="w-full min-w-[900px] border-collapse text-left text-sm">
                    <TableHeader className="bg-surface-muted text-xs uppercase text-muted">
                      <TableRow className="hover:bg-transparent border-0">
                        <TableHead className="px-4 py-3 text-left rtl:text-right">Statement row</TableHead>
                        <TableHead className="px-4 py-3 text-left rtl:text-right">Amount</TableHead>
                        <TableHead className="px-4 py-3 text-left rtl:text-right">Suggested ledger match</TableHead>
                        <TableHead className="px-4 py-3 text-left rtl:text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border-default">
                      {currentImport.lines.map(line => (
                        <TableRow key={line.id}>
                          <TableCell className="max-w-sm px-4 py-3"><p className="font-medium text-heading">{line.description}</p><p className="mt-1 text-xs text-muted">{formatCalendarDate(line.postedAt)}{line.reference ? ` · ${line.reference}` : ''}</p></TableCell>
                          <TableCell className="px-4 py-3 font-mono text-heading tabular-nums" title={`${line.amount} ${line.currency}`}>{formatCompactTableMoney(line.amount, { currency: line.currency })}</TableCell>
                          <TableCell className="px-4 py-3">{line.matchedLedgerLine ? <div className="text-xs text-body"><Badge variant="outline" className="inline-flex items-center gap-1 font-medium text-success border-0 bg-success-light"><Check size={14} /> Reconciled</Badge><p className="mt-1">{line.matchedLedgerLine.description}</p><p className="mt-0.5 text-muted">{line.matchedLedgerLine.sourceType} · {line.matchedLedgerLine.signedAmount} {line.matchedLedgerLine.currency} · {line.matchedLedgerLine.daysApart} day(s) apart</p></div> : line.suggestedMatches.length ? <div className="space-y-2">{line.suggestedMatches.slice(0, 3).map(candidate => <div key={candidate.journalLineId} className="text-xs text-body"><p>{candidate.description}</p><p className="mt-0.5 text-muted">{candidate.sourceType} · {candidate.signedAmount} {candidate.currency} · {candidate.daysApart} day(s) apart</p></div>)}</div> : <span className="text-xs text-muted">No exact match found</span>}</TableCell>
                          <TableCell className="px-4 py-3">{line.matchedJournalLineId ? <Button type="button" variant="outline" size="sm" onClick={() => unmatchMutation.mutate({ id: currentImport.id, lineId: line.id })} disabled={unmatchMutation.isPending} className="gap-1 h-7 px-2.5 text-xs font-medium"><RotateCcw size={13} /> Undo</Button> : line.suggestedMatches.length > 0 && <Select onValueChange={val => { if (val) matchMutation.mutate({ id: currentImport.id, lineId: line.id, journalLineId: val }) }} disabled={matchMutation.isPending}><SelectTrigger aria-label={`Match ${line.description}`} className="max-w-44 h-8 bg-surface text-xs"><SelectValue placeholder="Select candidate…" /></SelectTrigger><SelectContent>{line.suggestedMatches.map(candidate => <SelectItem key={candidate.journalLineId} value={candidate.journalLineId} className="text-xs">{candidate.signedAmount} {candidate.currency} · {candidate.daysApart}d</SelectItem>)}</SelectContent></Select>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>}
              </QueryState>
            </>}
          </QueryState>
        </div>
      </section>
    </div>
  )
}
