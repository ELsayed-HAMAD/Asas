import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  ChevronDown,
  MoreHorizontal,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'
import { hrService } from '../../../services/hr.service'

const formatCurrency = (num) => {
  const isNegative = num < 0
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(Math.abs(num))
  return isNegative ? `-${formatted}` : formatted
}

export default function Payroll() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['hr', 'payroll-runs'],
    queryFn: () => hrService.listPayrollRuns(),
  })

  const runs = data?.items ?? []
  const activeRun = runs[0] || null
  const records = activeRun?.lines ?? []
  const totals = activeRun?.totals ?? { totalGross: 0, taxes: 0, totalNet: 0 }

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
    mutationFn: () => hrService.approvePayrollRun(activeRun.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hr', 'payroll-runs'] }),
  })

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[900px]">
      <TopBarActions>
        <div className="flex gap-3">
          <button type="button" className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card">
            <Download size={16} /> Download ACH
          </button>
          {activeRun?.status === 'PAID' ? (
            <button
              type="button"
              className="bg-surface-strong text-heading px-5 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors shadow-card"
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
              <button type="button" className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm hover:bg-surface-muted bg-surface-raised shadow-card">
                Filter: All Depts <ChevronDown size={14} className="text-caption" />
              </button>
              <button type="button" className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm hover:bg-surface-muted bg-surface-raised shadow-card">
                Status: {activeRun?.status || 'None'} <ChevronDown size={14} className="text-caption" />
              </button>
            </div>
            <div className="h-4 w-px bg-border-default" />
            <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
              <input type="checkbox" className="rounded border-border-strong text-accent focus:ring-accent" defaultChecked />
              Auto-Calculate
            </label>
          </div>
          <div className="text-sm text-muted">
            {activeRun?.label || 'No payroll run'} · Pay date{' '}
            {activeRun?.payDate ? new Date(activeRun.payDate).toLocaleDateString() : '—'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border-default rounded-button p-4 bg-surface-muted/40">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Gross</p>
            <p className="text-2xl font-bold text-heading">{formatCurrency(totals.totalGross)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-muted/40">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Taxes / Deductions</p>
            <p className="text-2xl font-bold text-heading">{formatCurrency(totals.taxes)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-muted/40">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Net</p>
            <p className="text-2xl font-bold text-heading">{formatCurrency(totals.totalNet)}</p>
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
              {error?.response?.data?.error?.message || 'Unable to load payroll.'}
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
                            {(record.employee || '?').charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-heading">{record.employee}</p>
                            <p className="text-[11px] text-muted">{record.department || record.idNumber || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-body">{formatCurrency(record.gross)}</td>
                      <td className="px-6 py-4 text-sm text-body">{formatCurrency(-Math.abs(record.deductions))}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-heading">{formatCurrency(record.net)}</td>
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
                <h2 className="text-xl font-bold text-heading">{selectedRecord.employee}</h2>
                <p className="text-sm text-muted">{selectedRecord.department || selectedRecord.idNumber}</p>
              </div>
              <div className="space-y-3 border border-border-default rounded-button p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Base salary</span>
                  <span className="font-medium text-heading">{formatCurrency(selectedRecord.breakdown?.baseSalary || selectedRecord.gross)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Missed days ({selectedRecord.breakdown?.missedDays?.count || 0})</span>
                  <span className="font-medium text-heading">{formatCurrency(-(selectedRecord.breakdown?.missedDays?.amount || 0))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Bonus {selectedRecord.breakdown?.bonus?.label ? `(${selectedRecord.breakdown.bonus.label})` : ''}</span>
                  <span className="font-medium text-heading">{formatCurrency(selectedRecord.breakdown?.bonus?.amount || 0)}</span>
                </div>
                {(selectedRecord.breakdown?.taxes || []).map(tax => (
                  <div key={tax.label} className="flex justify-between text-sm">
                    <span className="text-muted flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted" />
                      {tax.label}
                    </span>
                    <span className="font-medium text-heading">{formatCurrency(-Math.abs(tax.amount))}</span>
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
