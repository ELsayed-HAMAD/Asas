import React, { useState } from 'react'
import { 
  Download, 
  ChevronDown,
  MoreHorizontal,
  CheckSquare,
  Square
} from 'lucide-react'

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
    <div className="flex h-full flex-col bg-white overflow-hidden min-w-[900px]">
      
      {/* ── Toolbar & KPIs (Merged to save space) ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-gray-100 shadow-sm z-10 relative">
        
        {/* Filters & Global Actions */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-6">
            <div className="flex gap-3">
              <button className="flex items-center gap-2 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm hover:bg-gray-50 bg-white shadow-sm">
                Filter: All Depts <ChevronDown size={14} className="text-gray-400" />
              </button>
              <button className="flex items-center gap-2 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm hover:bg-gray-50 bg-white shadow-sm">
                Status: Pending <ChevronDown size={14} className="text-gray-400" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-5 bg-blue-600 rounded-full relative cursor-pointer flex items-center px-0.5">
                <div className="w-4 h-4 bg-white rounded-full translate-x-5 transition-transform shadow-sm" />
              </div>
              <span className="text-sm font-medium text-gray-700">Auto-Calculate</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors bg-white shadow-sm">
              <Download size={16} /> Download ACH
            </button>
            <button className="bg-black text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm">
              Approve Pay Run
            </button>
          </div>
        </div>

        {/* KPIs Row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Total Gross</p>
            <p className="text-2xl font-bold text-gray-900">$342,500</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Taxes</p>
            <p className="text-2xl font-bold text-red-600">-$68,400</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Total Net</p>
            <p className="text-2xl font-bold text-gray-900">$274,100</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pay Date</p>
            <p className="text-2xl font-bold text-gray-900">Jun 18</p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Table Area */}
        <div className="flex-1 overflow-y-auto bg-white">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <tr>
                <th className="px-4 py-3 border-b border-gray-100 w-10">
                  <Square size={16} className="text-gray-300" />
                </th>
                <th className="px-2 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 flex items-center gap-1">
                  Employee <ChevronDown size={12} />
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">
                  <div className="flex items-center justify-end gap-1">Gross <ChevronDown size={12} /></div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">
                  <div className="flex items-center justify-end gap-1">Deductions <ChevronDown size={12} /></div>
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">
                  <div className="flex items-center justify-end gap-1">Net Pay <ChevronDown size={12} /></div>
                </th>
                <th className="px-4 py-3 border-b border-gray-100 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {MOCK_PAYROLL.map(record => {
                const isSelected = selectedId === record.id

                return (
                  <tr 
                    key={record.id}
                    onClick={() => setSelectedId(record.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/50' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {isSelected 
                        ? <CheckSquare size={16} className="text-blue-600" fill="#2563EB" stroke="white" /> 
                        : <Square size={16} className="text-gray-300" />
                      }
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {record.avatar}
                        </div>
                        <span className="text-sm text-gray-700">{record.employee}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-700 tabular-nums">{formatCurrency(record.gross)}</td>
                    <td className="px-4 py-2.5 text-right text-sm text-red-500 tabular-nums">{formatCurrency(record.deductions)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(record.net)}</td>
                    <td className="px-4 py-2.5 text-center text-gray-400">
                      <MoreHorizontal size={16} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-[440px] bg-gray-50 border-l border-gray-200 overflow-y-auto p-5 flex-shrink-0 shadow-inner">
          {selectedRecord && selectedRecord.breakdown && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-full">
              
              {/* Profile Header */}
              <div className="p-6 pb-5 flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm">
                    {selectedRecord.avatar}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 leading-tight">{selectedRecord.employee}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{selectedRecord.department} • ID: {selectedRecord.idNumber}</p>
                  </div>
                </div>
                <button className="bg-black text-white text-xs font-semibold px-4 py-2 rounded-md hover:bg-gray-800 transition-colors">
                  Recalculate
                </button>
              </div>

              {/* Breakdown Content */}
              <div className="px-6 flex-1 space-y-7">
                
                {/* Base Earnings */}
                <div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Base Earnings</h4>
                  <div className="flex justify-between items-center text-sm mb-3">
                    <span className="text-gray-700">Base Salary (Semi-Monthly)</span>
                    <span className="font-medium text-gray-900 tabular-nums">{formatCurrency(selectedRecord.breakdown.baseSalary)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-semibold text-gray-900 pt-3 border-t border-gray-100">
                    <span>Subtotal: Gross Base</span>
                    <span className="tabular-nums">{formatCurrency(selectedRecord.breakdown.baseSalary)}</span>
                  </div>
                </div>

                {/* Manual Adjustments */}
                <div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Manual Adjustments</h4>
                  <div className="flex justify-between items-center text-sm mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-700">Missed Days (1)</span>
                      <input type="text" defaultValue={selectedRecord.breakdown.missedDays.count} className="w-10 text-center border border-gray-300 rounded text-xs py-0.5 outline-none focus:border-blue-500" />
                    </div>
                    <span className="font-medium text-red-600 tabular-nums">{formatCurrency(selectedRecord.breakdown.missedDays.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-700">Ad-Hoc Bonus</span>
                      <input type="text" defaultValue={selectedRecord.breakdown.bonus.label} className="w-14 text-center border border-gray-300 rounded text-xs py-0.5 outline-none focus:border-blue-500" />
                    </div>
                    <span className="font-medium text-emerald-600 tabular-nums">+{formatCurrency(selectedRecord.breakdown.bonus.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-semibold text-gray-900 pt-3 border-t border-gray-100">
                    <span>Subtotal: Adjustments</span>
                    <span className="text-emerald-600 tabular-nums">+{formatCurrency(300)}</span>
                  </div>
                </div>

                {/* Taxes & Deductions */}
                <div>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Taxes & Deductions</h4>
                  <div className="space-y-3.5">
                    {selectedRecord.breakdown.taxes.map((tax, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-700">{tax.label}</span>
                          {tax.override && (
                            <span className="text-[8px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded uppercase">Override</span>
                          )}
                        </div>
                        <span className="font-medium text-red-600 tabular-nums">{formatCurrency(tax.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-sm font-semibold text-gray-900 pt-4 mt-4 border-t border-gray-100">
                    <span>Subtotal: Total Taxes</span>
                    <span className="text-red-600 tabular-nums">{formatCurrency(-1100)}</span>
                  </div>
                </div>

              </div>

              {/* Grand Total Footer */}
              <div className="mt-6 border-t-[3px] border-black p-6 bg-gray-50/50 flex justify-between items-center">
                <span className="text-sm font-bold text-gray-900 uppercase">Total Net Pay</span>
                <span className="text-3xl font-bold text-gray-900 tabular-nums">{formatCurrency(selectedRecord.net)}</span>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}