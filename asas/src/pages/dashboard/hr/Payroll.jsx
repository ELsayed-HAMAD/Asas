import React, { useState } from 'react'
import { 
  Download, 
  ChevronDown,
  MoreHorizontal,
  CheckSquare,
  Square
} from 'lucide-react'
import TopBarActions from '../../../components/TopBarActions'

// ── Mock Data ────────────────────────────────────────────────
const MOCK_PAYROLL = [
  {
    id: 'pay_001',
    employee: 'Marcus Chen',
    avatar: 'M',
    department: 'Engineering Dept',
    idNumber: '89422',
    gross: 5200.00,
    deductions: -1100.00,
    net: 4400.00,
    breakdown: {
      baseSalary: 5200.00,
      missedDays: { count: 1, amount: -200.00 },
      bonus: { label: '$500', amount: 500.00 },
      taxes: [
        { label: 'Federal Tax', amount: -620.00, override: true },
        { label: 'State Tax', amount: -210.00, override: true },
        { label: '401(k) / Health', amount: -270.00, override: true },
      ]
    }
  },
  { id: 'pay_002', employee: 'Sarah Jenkins', avatar: 'S', gross: 4800.00, deductions: -950.00, net: 3850.00 },
  { id: 'pay_003', employee: 'James Wilson', avatar: 'J', gross: 6100.00, deductions: -1300.00, net: 4800.00 },
  { id: 'pay_004', employee: 'Elena Rodriguez', avatar: 'E', gross: 5500.00, deductions: -1150.00, net: 4350.00 },
  { id: 'pay_005', employee: 'David Kim', avatar: 'D', gross: 7200.00, deductions: -1600.00, net: 5600.00 },
  { id: 'pay_006', employee: 'Michael Chang', avatar: 'M', gross: 4900.00, deductions: -980.00, net: 3920.00 },
  { id: 'pay_007', employee: 'Amanda Foster', avatar: 'A', gross: 5300.00, deductions: -1050.00, net: 4250.00 },
  { id: 'pay_008', employee: 'Robert Taylor', avatar: 'R', gross: 6500.00, deductions: -1400.00, net: 5100.00 },
  { id: 'pay_009', employee: 'Jessica Davis', avatar: 'J', gross: 4600.00, deductions: -900.00, net: 3700.00 },
  { id: 'pay_010', employee: 'Daniel Miller', avatar: 'D', gross: 5800.00, deductions: -1200.00, net: 4600.00 },
  { id: 'pay_011', employee: 'William Brown', avatar: 'W', gross: 5100.00, deductions: -1020.00, net: 4080.00 },
  { id: 'pay_012', employee: 'Emily Jones', avatar: 'E', gross: 6300.00, deductions: -1350.00, net: 4950.00 },
]

const formatCurrency = (num) => {
  const isNegative = num < 0
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2
  }).format(Math.abs(num))
  return isNegative ? `-${formatted}` : formatted
}

export default function Payroll() {
  const [selectedId, setSelectedId] = useState('pay_001')
  const selectedRecord = MOCK_PAYROLL.find(r => r.id === selectedId)

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[900px]">
      
      <TopBarActions>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card">
            <Download size={16} /> Download ACH
          </button>
          <button className="bg-primary text-white px-5 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors shadow-card">
            Approve Pay Run
          </button>
        </div>
      </TopBarActions>

      {/* ── Toolbar & KPIs (Merged to save space) ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-border-subtle shadow-card z-10 relative">
        
        {/* Filters & Global Actions */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-6">
            <div className="flex gap-3">
              <button className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm hover:bg-surface-muted bg-surface-raised shadow-card">
                Filter: All Depts <ChevronDown size={14} className="text-caption" />
              </button>
              <button className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm hover:bg-surface-muted bg-surface-raised shadow-card">
                Status: Pending <ChevronDown size={14} className="text-caption" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-5 bg-accent rounded-full relative cursor-pointer flex items-center px-0.5">
                <div className="w-4 h-4 bg-surface-raised rounded-full translate-x-5 transition-transform shadow-card" />
              </div>
              <span className="text-sm font-medium text-body">Auto-Calculate</span>
            </div>
          </div>

        </div>

        {/* KPIs Row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-border-default rounded-button p-4 bg-surface-raised">
            <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-2">Total Gross</p>
            <p className="text-3xl font-bold text-heading">$342,500</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised">
            <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-2">Taxes</p>
            <p className="text-3xl font-bold text-danger">-$68,400</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised">
            <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-2">Total Net</p>
            <p className="text-3xl font-bold text-heading">$274,100</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised">
            <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-2">Pay Date</p>
            <p className="text-3xl font-bold text-heading">Jun 18</p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Table Area */}
        <div className="flex-1 overflow-y-auto bg-surface-raised">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-raised sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <tr>
                <th className="px-4 py-3 border-b border-border-subtle w-10">
                  <Square size={16} className="text-faint" />
                </th>
                <th className="px-2 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-subtle flex items-center gap-1">
                  Employee <ChevronDown size={12} />
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-subtle text-right">
                  <div className="flex items-center justify-end gap-1">Gross <ChevronDown size={12} /></div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-subtle text-right">
                  <div className="flex items-center justify-end gap-1">Deductions <ChevronDown size={12} /></div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-subtle text-right">
                  <div className="flex items-center justify-end gap-1">Net Pay <ChevronDown size={12} /></div>
                </th>
                <th className="px-4 py-3 border-b border-border-subtle w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-faint">
              {MOCK_PAYROLL.map(record => {
                const isSelected = selectedId === record.id

                return (
                  <tr 
                    key={record.id}
                    onClick={() => setSelectedId(record.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-accent-light/50' : 'bg-surface-raised hover:bg-surface-muted'
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {isSelected 
                        ? <CheckSquare size={16} className="text-accent" fill="#2563EB" stroke="white" /> 
                        : <Square size={16} className="text-faint" />
                      }
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                          isSelected ? 'bg-accent text-white' : 'bg-surface-active text-muted'
                        }`}>
                          {record.avatar}
                        </div>
                        <span className="text-sm text-body">{record.employee}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-body tabular-nums">{formatCurrency(record.gross)}</td>
                    <td className="px-4 py-2.5 text-right text-sm text-danger tabular-nums">{formatCurrency(record.deductions)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-heading tabular-nums">{formatCurrency(record.net)}</td>
                    <td className="px-4 py-2.5 text-center text-caption">
                      <MoreHorizontal size={16} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-[440px] bg-surface-muted border-l border-border-default overflow-y-auto p-4 flex-shrink-0 shadow-panel">
          {selectedRecord && selectedRecord.breakdown && (
            <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col min-h-full">
              
              {/* Profile Header */}
              <div className="p-6 pb-5 flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-card">
                    {selectedRecord.avatar}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-heading leading-tight">{selectedRecord.employee}</h2>
                    <p className="text-xs text-muted mt-0.5">{selectedRecord.department} • ID: {selectedRecord.idNumber}</p>
                  </div>
                </div>
                <button className="bg-primary text-white text-xs font-semibold px-4 py-2 rounded-input hover:bg-primary-hover transition-colors">
                  Recalculate
                </button>
              </div>

              {/* Breakdown Content */}
              <div className="px-6 flex-1 space-y-7">
                
                {/* Base Earnings */}
                <div>
                  <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Base Earnings</h4>
                  <div className="flex justify-between items-center text-sm mb-3">
                    <span className="text-body">Base Salary (Semi-Monthly)</span>
                    <span className="font-medium text-heading tabular-nums">{formatCurrency(selectedRecord.breakdown.baseSalary)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-semibold text-heading pt-3 border-t border-border-subtle">
                    <span>Subtotal: Gross Base</span>
                    <span className="tabular-nums">{formatCurrency(selectedRecord.breakdown.baseSalary)}</span>
                  </div>
                </div>

                {/* Manual Adjustments */}
                <div>
                  <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Manual Adjustments</h4>
                  <div className="flex justify-between items-center text-sm mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-body">Missed Days (1)</span>
                      <input type="text" defaultValue={selectedRecord.breakdown.missedDays.count} className="w-10 text-center border border-border-strong rounded text-xs py-0.5 outline-none focus:border-accent" />
                    </div>
                    <span className="font-medium text-danger tabular-nums">{formatCurrency(selectedRecord.breakdown.missedDays.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-body">Ad-Hoc Bonus</span>
                      <input type="text" defaultValue={selectedRecord.breakdown.bonus.label} className="w-14 text-center border border-border-strong rounded text-xs py-0.5 outline-none focus:border-accent" />
                    </div>
                    <span className="font-medium text-success tabular-nums">+{formatCurrency(selectedRecord.breakdown.bonus.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-semibold text-heading pt-3 border-t border-border-subtle">
                    <span>Subtotal: Adjustments</span>
                    <span className="text-success tabular-nums">+{formatCurrency(300)}</span>
                  </div>
                </div>

                {/* Taxes & Deductions */}
                <div>
                  <h4 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Taxes & Deductions</h4>
                  <div className="space-y-3.5">
                    {selectedRecord.breakdown.taxes.map((tax, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-body">{tax.label}</span>
                          {tax.override && (
                            <span className="text-[8px] font-bold bg-surface-active text-muted px-1.5 py-0.5 rounded uppercase">Override</span>
                          )}
                        </div>
                        <span className="font-medium text-danger tabular-nums">{formatCurrency(tax.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-sm font-semibold text-heading pt-4 mt-4 border-t border-border-subtle">
                    <span>Subtotal: Total Taxes</span>
                    <span className="text-danger tabular-nums">{formatCurrency(-1100)}</span>
                  </div>
                </div>

              </div>

              {/* Grand Total Footer */}
              <div className="mt-6 border-t-[3px] border-black p-6 bg-surface-muted/50 flex justify-between items-center">
                <span className="text-sm font-bold text-heading uppercase">Total Net Pay</span>
                <span className="text-3xl font-bold text-heading tabular-nums">{formatCurrency(selectedRecord.net)}</span>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}