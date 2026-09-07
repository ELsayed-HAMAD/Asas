import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  ChevronDown,
  MoreHorizontal,
  Loader2,
} from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import { hrApi } from '../../../lib/api/hr'
import { queryKeys } from '../../../lib/queryKeys'
import { formatMoney, formatDate } from '../../../lib/format'

// The old page rendered deductions/taxes as a leading-minus negative; the minus only appears
// for a positive amount (a zero rendered plain), so mirror that instead of an unconditional '-'.
function formatNegativeDeduction(value) {
  return Number(value) > 0 ? `-${formatMoney(value)}` : formatMoney(value)
}

export default function Payroll() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)

  const { data: listData, isLoading: isLoadingList, isError, error } = useQuery({
    queryKey: queryKeys.hr.payrollRuns.list(),
    queryFn: () => hrApi.listPayrollRuns(),
  })

  const activeRun = listData?.items?.[0] || null
  const activeRunId = activeRun?.id || null

  // The full run (its lines + per-line tax split) drives the table and the breakdown panel.
  const { data: run, isLoading: isLoadingRun } = useQuery({
    queryKey: queryKeys.hr.payrollRuns.detail(activeRunId),
    queryFn: () => hrApi.getPayrollRun(activeRunId),
    enabled: !!activeRunId,
  })

  const isLoading = isLoadingList || (!!activeRunId && isLoadingRun)

  const records = run?.lines ?? []

  // The active run's KPI totals — summed from that run's lines, exactly as the old page
  // derived `activeRun.totals`. Money arrives as major-unit decimal strings, so coerce to
  // Number for display aggregation only.
  const totals = records.reduce(
    (acc, line) => {
      acc.totalGross += Number(line.gross)
      acc.taxes += Number(line.deductions)
      acc.totalNet += Number(line.net)
      return acc
    },
    { totalGross: 0, taxes: 0, totalNet: 0 },
  )

  useEffect(() => {
    if (!records.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !records.some(r => r.id === selectedId)) {
      setSelectedId(records[0].id)
    }
  }, [records, selectedId])

  const selectedRecord = records.find(r => r.id === selectedId)

  const approveMutation = useMutation({
    mutationFn: () => hrApi.approvePayrollRun(activeRun.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[900px]">
      <TopBarActions>
        <div className="flex gap-3">
          <button type="button" disabled className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card disabled:opacity-60">
            <Download size={16} /> Download ACH
          </button>
          {activeRun?.status === 'PAID' ? (
            <button
              type="button"
              disabled
              className="bg-surface-strong text-heading px-5 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors shadow-card disabled:opacity-60"
            >
              Export Ledger
            </button>
          ) : (
            <button
              type="button"
              disabled={!activeRun || activeRun.status === 'APPROVED' || approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
              className="bg-primary text-white px-5 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {activeRun?.status === 'APPROVED' ? 'Pay Run Approved' : 'Approve Pay Run'}
            </button>
          )}
        </div>
      </TopBarActions>

      <div className="px-6 py-5 flex-shrink-0 border-b border-border-subtle shadow-card z-10 relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-6">
            <div className="flex gap-3">
              <button type="button" disabled className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm hover:bg-surface-muted bg-surface-raised shadow-card disabled:opacity-60">
                Filter: All Depts <ChevronDown size={14} className="text-caption" />
              </button>
              <button type="button" disabled className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm hover:bg-surface-muted bg-surface-raised shadow-card disabled:opacity-60">
                Status: {activeRun?.status || 'None'} <ChevronDown size={14} className="text-caption" />
              </button>
            </div>
            <div className="h-4 w-px bg-border-default" />
            <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
              <input type="checkbox" className="rounded border-border-strong text-accent focus:ring-accent" defaultChecked readOnly />
              Auto-Calculate
            </label>
          </div>
          <div className="text-sm text-muted">
            {activeRun?.label || 'No payroll run'} · Pay date{' '}
            {activeRun?.payDate ? formatDate(activeRun.payDate) : '—'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border-default rounded-button p-4 bg-surface-muted/40">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Gross</p>
            <p className="text-2xl font-bold text-heading">{formatMoney(totals.totalGross)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-muted/40">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Taxes / Deductions</p>
            <p className="text-2xl font-bold text-heading">{formatMoney(totals.taxes)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-muted/40">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Net</p>
            <p className="text-2xl font-bold text-heading">{formatMoney(totals.totalNet)}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading payroll…
            </div>
          )}
          {isError && (
            <div className="p-6 text-sm text-danger">
              {error?.message || 'Unable to load payroll.'}
            </div>
          )}
          {!isLoading && !isError && records.length === 0 && (
            <div className="p-10 text-center">
              <p className="text-base font-semibold text-heading mb-1">No payroll lines</p>
              <p className="text-sm text-muted">Load the sample pack or create a payroll run to see data here.</p>
            </div>
          )}
          {!isLoading && records.length > 0 && (
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Employee</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Gross</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Deductions</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Net</th>
                  <th className="px-6 py-3 border-b border-border-default w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {records.map(record => {
                  const isSelected = selectedId === record.id
                  return (
                    <tr
                      key={record.id}
                      onClick={() => setSelectedId(record.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-accent-light/50' : 'hover:bg-surface-muted'}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-bold text-heading">
                            {(record.employee?.name || '?').charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-heading">{record.employee?.name}</p>
                            <p className="text-[11px] text-muted">{record.employee?.title || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-body">{formatMoney(record.gross)}</td>
                      <td className="px-6 py-4 text-sm text-body">{formatNegativeDeduction(record.deductions)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-heading">{formatMoney(record.net)}</td>
                      <td className="px-6 py-4">
                        <MoreHorizontal size={16} className="text-caption" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="w-[380px] border-l border-border-default p-6 overflow-y-auto flex-shrink-0">
          {!selectedRecord ? (
            <p className="text-sm text-muted">Select a payroll line to inspect breakdown.</p>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Selected</p>
                <h2 className="text-xl font-bold text-heading">{selectedRecord.employee?.name}</h2>
                <p className="text-sm text-muted">{selectedRecord.employee?.title || '—'}</p>
              </div>
              <div className="space-y-3 border border-border-default rounded-button p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Base salary</span>
                  <span className="font-medium text-heading">{formatMoney(selectedRecord.baseSalary || selectedRecord.gross)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Missed days ({selectedRecord.missedDaysCount || 0})</span>
                  <span className="font-medium text-heading">{formatNegativeDeduction(selectedRecord.missedDaysAmount || '0')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Bonus {selectedRecord.bonusLabel ? `(${selectedRecord.bonusLabel})` : ''}</span>
                  <span className="font-medium text-heading">{formatMoney(selectedRecord.bonusAmount || '0')}</span>
                </div>
                {(selectedRecord.taxLines || []).map(tax => (
                  <div key={tax.id} className="flex justify-between text-sm">
                    <span className="text-muted flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted" />
                      {tax.label}
                    </span>
                    <span className="font-medium text-heading">{formatNegativeDeduction(tax.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
